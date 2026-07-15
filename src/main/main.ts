import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CollectionService } from "./collection-service";
import { DocumentService } from "./document-service";
import { DocumentWatcher } from "./document-watcher";
import {
  buildSelfContainedHtml,
  ensureExportExtension,
  normaliseExportFileName,
  writeExportFile,
} from "./export-service";
import { SettingsStore } from "./settings-store";
import { recoverWindowBounds } from "./window-state";
import {
  appCommandSchema,
  clipboardPayloadSchema,
  clipboardTextSchema,
  documentStateSchema,
  externalUrlSchema,
  folderFileRequestSchema,
  folderIdSchema,
  folderSearchRequestSchema,
  htmlExportRequestSchema,
  IPC_CHANNELS,
  MARKDOWN_EXTENSIONS,
  MAX_CLIPBOARD_HTML_BYTES,
  MAX_CLIPBOARD_TEXT_BYTES,
  MAX_DOCUMENT_BYTES,
  readerSettingsPatchSchema,
  readingStateRequestSchema,
  recentFilesSchema,
  relativeNavigationRequestSchema,
  renderedDocumentPathSchema,
  remoteImagePolicySchema,
  pdfExportRequestSchema,
  windowTitleSchema,
  type AppCommand,
  type DocumentPayload,
  type RemoteImagePolicy,
} from "./ipc-contracts";

const RENDERER_ENTRY_PATH = resolve(__dirname, "../renderer/index.html");
const CAPTURE_READY_TIMEOUT_MS = 30_000;

let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let remoteImagePolicy: RemoteImagePolicy = "block";
let captureStarted = false;
let captureExpectedPath: string | null = null;
let captureFallbackTimer: NodeJS.Timeout | null = null;
let captureClipboardResolver: (() => void) | null = null;
let settingsStore: SettingsStore | null = null;
let activeDocumentPath: string | null = null;
let windowStateTimer: NodeJS.Timeout | null = null;
const pendingOpenPaths: string[] = [];
let openRequestChain: Promise<void> = Promise.resolve();
let pendingOpenRequestCount = 0;
const documentService = new DocumentService();
const collectionService = new CollectionService();

function requireSettingsStore(): SettingsStore {
  if (settingsStore === null) {
    throw new Error("Reader settings are not ready yet.");
  }
  return settingsStore;
}

const documentWatcher = new DocumentWatcher((untrustedState) => {
  const state = documentStateSchema.parse(untrustedState);
  if (rendererReady && mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.documentState, state);
  }
});

function pathKey(filePath: string): string {
  const absolutePath = resolve(filePath);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase() : absolutePath;
}

function findMarkdownArgument(argumentsList: readonly string[]): string | null {
  for (const argument of argumentsList) {
    if (MARKDOWN_EXTENSIONS.has(extnameSafe(argument))) {
      return resolve(argument);
    }
  }
  return null;
}

function extnameSafe(filePath: string): string {
  const lastSeparator = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const lastDot = filePath.lastIndexOf(".");
  return lastDot > lastSeparator ? filePath.slice(lastDot).toLocaleLowerCase() : "";
}

function enqueueDocumentOpen(untrustedPath: string): void {
  if (captureWasRequested()) {
    console.error(`[capture] enqueue ${untrustedPath}`);
  }
  pendingOpenRequestCount += 1;
  openRequestChain = openRequestChain
    .then(async () => {
      const grantedPath = await documentService.grant(untrustedPath);
      if (captureWasRequested()) {
        console.error(`[capture] granted ${grantedPath}`);
      }
      pendingOpenPaths.push(grantedPath);
      flushOpenQueue();
    })
    .catch((error: unknown) => {
      if (captureWasRequested()) {
        console.error(`[capture] grant failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      // Ignore malformed operating-system arguments; renderer-initiated paths
      // still return their validation error to the caller.
    })
    .finally(() => {
      pendingOpenRequestCount -= 1;
    });
}

function flushOpenQueue(): void {
  if (!rendererReady || mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }
  while (pendingOpenPaths.length > 0) {
    const filePath = pendingOpenPaths.shift();
    if (filePath !== undefined) {
      captureExpectedPath = filePath;
      mainWindow.webContents.send(IPC_CHANNELS.documentOpenPath, filePath);
    }
  }
}

async function broadcastRecentFiles(): Promise<void> {
  const files = await requireSettingsStore().getRecentFiles();
  if (rendererReady && mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.recentFilesChanged, recentFilesSchema.parse(files));
  }
  await createApplicationMenu();
}

async function activateDocument(
  document: DocumentPayload,
  recordInHistory: boolean,
): Promise<DocumentPayload> {
  const changedDocument = activeDocumentPath === null || pathKey(activeDocumentPath) !== pathKey(document.path);
  activeDocumentPath = document.path;
  documentWatcher.watch(document.path);
  if (recordInHistory || changedDocument) {
    try {
      await requireSettingsStore().recordDocumentOpened(document.path);
      await broadcastRecentFiles();
    } catch {
      // A read-only or temporarily unavailable settings directory must not block
      // an otherwise valid local document from opening.
    }
  }
  return document;
}

async function resolveActiveDocumentPath(untrustedPath: unknown): Promise<string> {
  const canonicalPath = await documentService.resolveGranted(untrustedPath);
  if (activeDocumentPath === null || pathKey(canonicalPath) !== pathKey(activeDocumentPath)) {
    throw new Error("This action is available only for the active document.");
  }
  return canonicalPath;
}

function scheduleWindowStateSave(): void {
  if (mainWindow === null || settingsStore === null) {
    return;
  }
  if (windowStateTimer !== null) {
    clearTimeout(windowStateTimer);
  }
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    if (mainWindow === null || settingsStore === null || mainWindow.isDestroyed()) {
      return;
    }
    const bounds = mainWindow.getNormalBounds();
    void settingsStore.setWindowState({ bounds, maximized: mainWindow.isMaximized() }).catch(() => undefined);
  }, 350);
}

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (mainWindow === null || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return false;
  }
  const frame = event.senderFrame;
  if (frame === null || frame !== mainWindow.webContents.mainFrame) {
    return false;
  }
  try {
    const rendererUrl = new URL(frame.url);
    return rendererUrl.protocol === "file:"
      && pathKey(fileURLToPath(rendererUrl)) === pathKey(RENDERER_ENTRY_PATH);
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error("Rejected an IPC request from an untrusted renderer frame.");
  }
}

async function waitForClipboardRetry(): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 60));
}

async function writeRichClipboard(html: string, text: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    clipboard.write({ html, text });
    const htmlWritten = html.length === 0 || clipboard.readHTML().length > 0;
    const textWritten = text.length === 0 || clipboard.readText().length > 0;
    if (htmlWritten && textWritten) {
      return;
    }
    await waitForClipboardRetry();
  }
  throw new Error("The system clipboard is unavailable. Close any clipboard manager or application using it, then try again.");
}

async function writeTextClipboard(text: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    clipboard.writeText(text);
    if (text.length === 0 || clipboard.readText().length > 0) {
      return;
    }
    await waitForClipboardRetry();
  }
  throw new Error("The system clipboard is unavailable. Close any clipboard manager or application using it, then try again.");
}

function sendCommand(command: AppCommand): void {
  if (rendererReady && mainWindow !== null) {
    mainWindow.webContents.send(IPC_CHANNELS.appCommand, appCommandSchema.parse(command));
  }
}

async function createApplicationMenu(): Promise<void> {
  const recentFiles = settingsStore === null ? [] : await settingsStore.getRecentFiles(false);
  const recentSubmenu: MenuItemConstructorOptions[] = recentFiles.length === 0
    ? [{ label: "No recent files", enabled: false }]
    : recentFiles.map((entry) => ({
      label: entry.name,
      sublabel: dirnameSafe(entry.path),
      click: () => enqueueDocumentOpen(entry.path),
    }));
  if (recentFiles.length > 0) {
    recentSubmenu.push(
      { type: "separator" },
      {
        label: "Clear recent files",
        click: () => {
          void requireSettingsStore().clearHistory().then(broadcastRecentFiles);
        },
      },
    );
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "Open Markdown…", accelerator: "CommandOrControl+O", click: () => sendCommand("open") },
        { label: "Open folder…", accelerator: "CommandOrControl+Shift+O", click: () => sendCommand("open-folder") },
        { label: "Open Recent", submenu: recentSubmenu },
        { label: "Reload file", accelerator: "CommandOrControl+R", click: () => sendCommand("reload") },
        { type: "separator" },
        { label: process.platform === "darwin" ? "Reveal in Finder" : "Reveal in File Explorer", click: () => sendCommand("reveal") },
        { label: "Open in default application", click: () => sendCommand("open-editor") },
        { type: "separator" },
        { label: "Print…", accelerator: "CommandOrControl+P", click: () => sendCommand("print") },
        { label: "Export self-contained HTML…", click: () => sendCommand("export-html") },
        { label: "Export PDF…", click: () => sendCommand("export-pdf") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Navigate",
      submenu: [
        { label: "Back", accelerator: "Alt+Left", click: () => sendCommand("back") },
        { label: "Forward", accelerator: "Alt+Right", click: () => sendCommand("forward") },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "copy" },
        { label: "Copy rendered document", accelerator: "CommandOrControl+Shift+C", click: () => sendCommand("copy-all") },
        { label: "Copy as Markdown", accelerator: "CommandOrControl+Alt+C", click: () => sendCommand("copy-markdown") },
        { type: "separator" },
        { label: "Find in document", accelerator: "CommandOrControl+F", click: () => sendCommand("find") },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle light/dark mode", accelerator: "CommandOrControl+Shift+L", click: () => sendCommand("theme") },
        { label: "Toggle contents", accelerator: "CommandOrControl+Shift+T", click: () => sendCommand("contents") },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Chwezi Markdown Reader",
          click: () => mainWindow?.webContents.send(IPC_CHANNELS.appAboutRequested),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function dirnameSafe(filePath: string): string {
  const separator = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return separator <= 0 ? filePath : filePath.slice(0, separator);
}

function configureRemoteRequestPolicy(window: BrowserWindow): void {
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: remoteImagePolicy === "block" }),
  );
}

function createWindow(): void {
  rendererReady = false;
  const storedWindowState = settingsStore?.getWindowState() ?? null;
  const restoredBounds = recoverWindowBounds(
    storedWindowState,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  mainWindow = new BrowserWindow({
    ...(restoredBounds ?? { width: 1200, height: 820 }),
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: "#f6f1e7",
    title: "Chwezi Markdown Reader",
    icon: resolve(
      __dirname,
      process.platform === "win32"
        ? "../../build-resources/app-icon.ico"
        : "../../build-resources/icon.png",
    ),
    webPreferences: {
      preload: resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureRemoteRequestPolicy(mainWindow);
  if (captureWasRequested()) {
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer-gone] ${details.reason} (${details.exitCode})`);
    });
  }
  void mainWindow.loadFile(RENDERER_ENTRY_PATH);
  mainWindow.once("ready-to-show", () => {
    if (storedWindowState?.maximized === true) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = externalUrlSchema.safeParse(url);
    if (parsed.success) {
      void shell.openExternal(parsed.data);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("did-start-loading", () => {
    rendererReady = false;
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape" && mainWindow?.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });
  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send(IPC_CHANNELS.windowFullscreenChanged, true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send(IPC_CHANNELS.windowFullscreenChanged, false);
  });
  mainWindow.on("move", scheduleWindowStateSave);
  mainWindow.on("resize", scheduleWindowStateSave);
  mainWindow.on("maximize", scheduleWindowStateSave);
  mainWindow.on("unmaximize", scheduleWindowStateSave);
  mainWindow.on("close", () => {
    if (windowStateTimer !== null) {
      clearTimeout(windowStateTimer);
      windowStateTimer = null;
    }
    if (mainWindow !== null && settingsStore !== null) {
      void settingsStore.setWindowState({
        bounds: mainWindow.getNormalBounds(),
        maximized: mainWindow.isMaximized(),
      }).catch(() => undefined);
    }
  });
  mainWindow.webContents.once("did-finish-load", scheduleCaptureFallback);
  mainWindow.on("closed", () => {
    documentWatcher.close();
    collectionService.closeAll();
    activeDocumentPath = null;
    mainWindow = null;
    rendererReady = false;
  });
  void createApplicationMenu();
}

function captureWasRequested(): boolean {
  return process.env.MD_VIEWER_CAPTURE_PATH !== undefined
    || process.env.MD_VIEWER_CAPTURE_DARK_PATH !== undefined
    || process.env.MD_VIEWER_CAPTURE_ABOUT_PATH !== undefined
    || process.env.MD_VIEWER_CAPTURE_FULLSCREEN_STATE_PATH !== undefined
    || process.env.MD_VIEWER_CAPTURE_CLIPBOARD_PATH !== undefined
    || process.env.MD_VIEWER_CAPTURE_CLIPBOARD_TEXT_PATH !== undefined;
}

async function waitForFullscreenState(expected: boolean): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (mainWindow?.isFullScreen() === expected) {
      return true;
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  return mainWindow?.isFullScreen() === expected;
}

function scheduleCaptureFallback(): void {
  if (!captureWasRequested() || captureStarted || captureFallbackTimer !== null) {
    return;
  }
  captureFallbackTimer = setTimeout(() => {
    captureFallbackTimer = null;
    void runVisualEvidenceCapture();
  }, CAPTURE_READY_TIMEOUT_MS);
}

async function runVisualEvidenceCapture(): Promise<void> {
  if (captureStarted || !captureWasRequested() || mainWindow === null) {
    return;
  }
  captureStarted = true;
  if (captureFallbackTimer !== null) {
    clearTimeout(captureFallbackTimer);
    captureFallbackTimer = null;
  }

  try {
    const lightCapturePath = process.env.MD_VIEWER_CAPTURE_PATH;
    const darkCapturePath = process.env.MD_VIEWER_CAPTURE_DARK_PATH;
    const aboutCapturePath = process.env.MD_VIEWER_CAPTURE_ABOUT_PATH;
    const fullscreenStatePath = process.env.MD_VIEWER_CAPTURE_FULLSCREEN_STATE_PATH;
    const clipboardCapturePath = process.env.MD_VIEWER_CAPTURE_CLIPBOARD_PATH;
    const clipboardTextCapturePath = process.env.MD_VIEWER_CAPTURE_CLIPBOARD_TEXT_PATH;
    if (lightCapturePath !== undefined) {
      const image = await mainWindow.webContents.capturePage();
      await writeFile(resolve(lightCapturePath), image.toPNG());
    }
    if (darkCapturePath !== undefined) {
      mainWindow.webContents.send(IPC_CHANNELS.appCommand, "theme");
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
      const image = await mainWindow.webContents.capturePage();
      await writeFile(resolve(darkCapturePath), image.toPNG());
    }
    if (aboutCapturePath !== undefined) {
      mainWindow.webContents.send(IPC_CHANNELS.appAboutRequested);
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
      const image = await mainWindow.webContents.capturePage();
      await writeFile(resolve(aboutCapturePath), image.toPNG());
    }
    if (fullscreenStatePath !== undefined) {
      mainWindow.setFullScreen(true);
      const entered = await waitForFullscreenState(true);
      mainWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      mainWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      const exited = await waitForFullscreenState(false);
      await writeFile(resolve(fullscreenStatePath), JSON.stringify({ entered, exited }), "utf8");
    }
    if (clipboardCapturePath !== undefined || clipboardTextCapturePath !== undefined) {
      const clipboardReady = new Promise<void>((resolveReady, rejectReady) => {
        const timeout = setTimeout(() => {
          captureClipboardResolver = null;
          rejectReady(new Error("The renderer did not finish writing the clipboard within 5 seconds."));
        }, 5_000);
        captureClipboardResolver = () => {
          clearTimeout(timeout);
          captureClipboardResolver = null;
          resolveReady();
        };
      });
      mainWindow.webContents.send(IPC_CHANNELS.appCommand, "copy-all");
      await clipboardReady;
      if (clipboardCapturePath !== undefined) {
        await writeFile(resolve(clipboardCapturePath), clipboard.readHTML(), "utf8");
      }
      if (clipboardTextCapturePath !== undefined) {
        await writeFile(resolve(clipboardTextCapturePath), clipboard.readText(), "utf8");
      }
    }
    app.quit();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Visual check failed", message);
    app.quit();
  }
}

ipcMain.handle(IPC_CHANNELS.dialogOpen, async (event) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return null;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Markdown",
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || selectedPath === undefined) {
    return null;
  }
  const grantedPath = await documentService.grant(selectedPath);
  return activateDocument(await documentService.load(grantedPath), true);
});

ipcMain.handle(IPC_CHANNELS.documentOpenDropped, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  const grantedPath = await documentService.grant(filePath);
  return activateDocument(await documentService.load(grantedPath), true);
});
ipcMain.handle(IPC_CHANNELS.documentRead, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  return activateDocument(await documentService.load(filePath), false);
});
ipcMain.handle(IPC_CHANNELS.navigationOpenRelative, async (event, request: unknown) => {
  assertTrustedSender(event);
  const parsed = relativeNavigationRequestSchema.parse(request);
  const activePath = await resolveActiveDocumentPath(parsed.currentPath);
  const result = await documentService.openRelative(parsed.href, activePath);
  await activateDocument(result.document, true);
  return result;
});
ipcMain.handle(IPC_CHANNELS.folderOpen, async (event) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return null;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Markdown folder",
    properties: ["openDirectory"],
  });
  const selectedPath = result.filePaths[0];
  if (result.canceled || selectedPath === undefined) {
    return null;
  }
  return collectionService.openFolder(selectedPath);
});
ipcMain.handle(IPC_CHANNELS.folderRefresh, async (event, folderId: unknown) => {
  assertTrustedSender(event);
  return collectionService.getSnapshot(folderIdSchema.parse(folderId));
});
ipcMain.handle(IPC_CHANNELS.folderClose, (event, folderId: unknown) => {
  assertTrustedSender(event);
  collectionService.closeFolder(folderIdSchema.parse(folderId));
});
ipcMain.handle(IPC_CHANNELS.folderOpenFile, async (event, request: unknown) => {
  assertTrustedSender(event);
  const parsed = folderFileRequestSchema.parse(request);
  const canonicalPath = await collectionService.resolveDocument(parsed.folderId, parsed.relativePath);
  const grantedPath = await documentService.grant(canonicalPath);
  return activateDocument(await documentService.load(grantedPath), true);
});
ipcMain.handle(IPC_CHANNELS.folderSearch, async (event, request: unknown) => {
  assertTrustedSender(event);
  return collectionService.searchFolder(folderSearchRequestSchema.parse(request));
});
ipcMain.handle(IPC_CHANNELS.folderCancelSearch, (event, requestId: unknown) => {
  assertTrustedSender(event);
  return collectionService.cancelSearch(folderIdSchema.parse(requestId));
});
ipcMain.handle(IPC_CHANNELS.recentOpen, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  const store = requireSettingsStore();
  if (!store.hasRecentFile(filePath)) {
    throw new Error("This file is not in the recent-files list.");
  }
  const grantedPath = await documentService.grant(filePath);
  return activateDocument(await documentService.load(grantedPath), true);
});
ipcMain.handle(IPC_CHANNELS.recentGet, async (event) => {
  assertTrustedSender(event);
  return requireSettingsStore().getRecentFiles();
});
ipcMain.handle(IPC_CHANNELS.recentClear, async (event) => {
  assertTrustedSender(event);
  await requireSettingsStore().clearHistory();
  await broadcastRecentFiles();
});
ipcMain.handle(IPC_CHANNELS.settingsGet, (event) => {
  assertTrustedSender(event);
  return requireSettingsStore().getReaderSettings();
});
ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (event, patch: unknown) => {
  assertTrustedSender(event);
  return requireSettingsStore().updateReaderSettings(readerSettingsPatchSchema.parse(patch));
});
ipcMain.handle(IPC_CHANNELS.readingGetState, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  const canonicalPath = await resolveActiveDocumentPath(filePath);
  return requireSettingsStore().getReadingState(canonicalPath);
});
ipcMain.handle(IPC_CHANNELS.readingSetState, async (event, request: unknown) => {
  assertTrustedSender(event);
  const parsed = readingStateRequestSchema.parse(request);
  const canonicalPath = await resolveActiveDocumentPath(parsed.path);
  await requireSettingsStore().setReadingState(canonicalPath, parsed.state);
});
ipcMain.handle(IPC_CHANNELS.shellRevealFile, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  const canonicalPath = await resolveActiveDocumentPath(filePath);
  shell.showItemInFolder(canonicalPath);
  return true;
});
ipcMain.handle(IPC_CHANNELS.shellOpenEditor, async (event, filePath: unknown) => {
  assertTrustedSender(event);
  const canonicalPath = await resolveActiveDocumentPath(filePath);
  return (await shell.openPath(canonicalPath)) === "";
});
ipcMain.handle(IPC_CHANNELS.exportHtml, async (event, request: unknown) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return false;
  }
  const parsed = htmlExportRequestSchema.parse(request);
  const canonicalDocumentPath = await resolveActiveDocumentPath(parsed.documentPath);
  const html = await buildSelfContainedHtml(parsed, canonicalDocumentPath);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export self-contained HTML",
    defaultPath: normaliseExportFileName(parsed.title, ".html"),
    filters: [{ name: "Web page", extensions: ["html"] }],
  });
  if (result.canceled || result.filePath === undefined) {
    return false;
  }
  await writeExportFile(ensureExportExtension(result.filePath, ".html"), html);
  return true;
});
ipcMain.handle(IPC_CHANNELS.exportPdf, async (event, request: unknown) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return false;
  }
  const parsed = pdfExportRequestSchema.parse(request);
  await resolveActiveDocumentPath(parsed.documentPath);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export PDF",
    defaultPath: normaliseExportFileName(parsed.suggestedName, ".pdf"),
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (result.canceled || result.filePath === undefined) {
    return false;
  }
  const pdf = await mainWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  if (pdf.byteLength > 128 * 1024 * 1024) {
    throw new Error("The generated PDF exceeds the 128 MB export limit.");
  }
  await writeExportFile(ensureExportExtension(result.filePath, ".pdf"), pdf);
  return true;
});
ipcMain.handle(IPC_CHANNELS.clipboardWriteRich, async (event, payload: unknown) => {
  assertTrustedSender(event);
  const parsed = clipboardPayloadSchema.parse(payload);
  await writeRichClipboard(parsed.html, parsed.text);
  if (captureWasRequested()) {
    console.error(`[capture] clipboard write html=${Buffer.byteLength(parsed.html)} text=${Buffer.byteLength(parsed.text)} readbackHtml=${Buffer.byteLength(clipboard.readHTML())} readbackText=${Buffer.byteLength(clipboard.readText())}`);
  }
});
ipcMain.handle(IPC_CHANNELS.clipboardWriteText, async (event, text: unknown) => {
  assertTrustedSender(event);
  await writeTextClipboard(clipboardTextSchema.parse(text));
});
ipcMain.handle(IPC_CHANNELS.documentPrint, (event) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return false;
  }
  return new Promise<boolean>((resolvePrint) => {
    mainWindow?.webContents.print({ printBackground: true }, (success) => resolvePrint(success));
  });
});
ipcMain.handle(IPC_CHANNELS.shellOpenExternal, async (event, url: unknown) => {
  assertTrustedSender(event);
  await shell.openExternal(externalUrlSchema.parse(url));
});
ipcMain.handle(IPC_CHANNELS.appGetInfo, (event) => {
  assertTrustedSender(event);
  return { version: app.getVersion() };
});
ipcMain.handle(IPC_CHANNELS.appGetLimits, (event) => {
  assertTrustedSender(event);
  return {
    maxDocumentBytes: MAX_DOCUMENT_BYTES,
    maxClipboardHtmlBytes: MAX_CLIPBOARD_HTML_BYTES,
    maxClipboardTextBytes: MAX_CLIPBOARD_TEXT_BYTES,
  };
});
ipcMain.handle(IPC_CHANNELS.remoteImageGetPolicy, (event) => {
  assertTrustedSender(event);
  return remoteImagePolicy;
});
ipcMain.handle(IPC_CHANNELS.remoteImageSetPolicy, (event, policy: unknown) => {
  assertTrustedSender(event);
  remoteImagePolicy = remoteImagePolicySchema.parse(policy);
});
ipcMain.handle(IPC_CHANNELS.windowToggleFullscreen, (event) => {
  assertTrustedSender(event);
  if (mainWindow === null) {
    return false;
  }
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
ipcMain.on(IPC_CHANNELS.windowSetTitle, (event, title: unknown) => {
  if (!isTrustedSender(event)) {
    return;
  }
  const parsed = windowTitleSchema.safeParse(title);
  if (parsed.success) {
    mainWindow?.setTitle(parsed.data);
  }
});
ipcMain.on(IPC_CHANNELS.appRendererReady, (event) => {
  if (!isTrustedSender(event)) {
    if (captureWasRequested()) {
      console.error(`[capture] rejected renderer-ready from ${event.senderFrame?.url ?? "unknown frame"}`);
    }
    return;
  }
  if (captureWasRequested()) {
    console.error(`[capture] renderer ready; queue=${pendingOpenPaths.length}; pending=${pendingOpenRequestCount}`);
  }
  rendererReady = true;
  flushOpenQueue();
});
ipcMain.on(IPC_CHANNELS.appClipboardWritten, (event) => {
  if (isTrustedSender(event)) {
    captureClipboardResolver?.();
  }
});
ipcMain.on(IPC_CHANNELS.appDocumentRendered, (event, documentPath: unknown) => {
  if (!isTrustedSender(event)) {
    return;
  }
  const renderedPath = renderedDocumentPathSchema.parse(documentPath);
  if (captureWasRequested()) {
    console.error(`[capture] rendered ${renderedPath ?? "empty"}; expected=${captureExpectedPath ?? "none"}; pending=${pendingOpenRequestCount}`);
  }
  if (renderedPath === null && pendingOpenRequestCount > 0) {
    return;
  }
  if (
    captureExpectedPath !== null
    && (renderedPath === null || pathKey(renderedPath) !== pathKey(captureExpectedPath))
  ) {
    return;
  }
  void runVisualEvidenceCapture();
});

const startupPath = findMarkdownArgument(process.argv);
if (startupPath !== null) {
  enqueueDocumentOpen(startupPath);
}

const hasLock = app.requestSingleInstanceLock();
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  enqueueDocumentOpen(filePath);
});

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const requestedPath = findMarkdownArgument(commandLine);
    if (requestedPath !== null) {
      enqueueDocumentOpen(requestedPath);
    }
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.chwezi.markdownreader");
    }
    settingsStore = new SettingsStore(resolve(app.getPath("userData"), "reader-settings.json"));
    await settingsStore.load();
    await settingsStore.getRecentFiles();
    if (startupPath === null) {
      const lastDocumentPath = settingsStore.getLastDocumentPath();
      if (lastDocumentPath !== null) {
        enqueueDocumentOpen(lastDocumentPath);
      }
    }
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Chwezi Markdown Reader could not start", message);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
