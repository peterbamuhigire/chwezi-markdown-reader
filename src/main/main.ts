import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { watch, type FSWatcher } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const filePathSchema = z
  .string()
  .min(1)
  .max(32_767)
  .refine((value) => MARKDOWN_EXTENSIONS.has(extname(value).toLowerCase()), {
    message: "Choose a Markdown file (.md, .markdown, .mdown, or .mkd).",
  });

const clipboardPayloadSchema = z.object({
  html: z.string().max(10 * 1024 * 1024),
  text: z.string().max(10 * 1024 * 1024),
});

const externalUrlSchema = z.string().max(8_192).refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}, "Only web and email links can be opened.");

interface DocumentPayload {
  readonly path: string;
  readonly fileUrl: string;
  readonly name: string;
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: number;
}

let mainWindow: BrowserWindow | null = null;
let activeWatcher: FSWatcher | null = null;
let activePath: string | null = null;
let pendingPath: string | null = findMarkdownArgument(process.argv);

function findMarkdownArgument(argumentsList: readonly string[]): string | null {
  for (const argument of argumentsList) {
    if (MARKDOWN_EXTENSIONS.has(extname(argument).toLowerCase())) {
      return resolve(argument);
    }
  }
  return null;
}

async function loadDocument(untrustedPath: string): Promise<DocumentPayload> {
  const parsedPath = filePathSchema.parse(untrustedPath);
  const absolutePath = resolve(parsedPath);
  const fileStats = await stat(absolutePath);

  if (!fileStats.isFile()) {
    throw new Error("The selected path is not a file.");
  }

  if (fileStats.size > MAX_DOCUMENT_BYTES) {
    throw new Error("This Markdown file is larger than the 20 MB reading limit.");
  }

  const rawContent = await readFile(absolutePath, "utf8");
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

  watchActiveDocument(absolutePath);

  return {
    path: absolutePath,
    fileUrl: pathToFileURL(absolutePath).toString(),
    name: basename(absolutePath),
    content,
    size: fileStats.size,
    modifiedAt: fileStats.mtimeMs,
  };
}

function watchActiveDocument(filePath: string): void {
  if (activePath === filePath && activeWatcher !== null) {
    return;
  }

  activeWatcher?.close();
  activePath = filePath;

  try {
    let debounceTimer: NodeJS.Timeout | null = null;
    activeWatcher = watch(filePath, () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        mainWindow?.webContents.send("document:changed", filePath);
      }, 180);
    });
    activeWatcher.on("error", () => {
      activeWatcher?.close();
      activeWatcher = null;
    });
  } catch {
    activeWatcher = null;
  }
}

function createApplicationMenu(): void {
  const sendCommand = (command: string): void => {
    mainWindow?.webContents.send("app:command", command);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "Open Markdown…", accelerator: "CommandOrControl+O", click: () => sendCommand("open") },
        { label: "Reload file", accelerator: "CommandOrControl+R", click: () => sendCommand("reload") },
        { type: "separator" },
        { label: "Print…", accelerator: "CommandOrControl+P", click: () => sendCommand("print") },
        { type: "separator" },
        { role: "quit" },
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
        { label: "About Chwezi Markdown Reader", click: () => void showAboutDialog() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function showAboutDialog(): Promise<void> {
  const options = {
    type: "info" as const,
    title: "About Chwezi Markdown Reader",
    message: `Chwezi Markdown Reader ${app.getVersion()}`,
    detail: [
      "A focused Markdown reader with formatting-preserving copy.",
      "",
      "Developer",
      "Peter Bamuhigire",
      "peter@techguypeter.com",
      "+256784464178",
      "Kampala, Uganda",
    ].join("\n"),
    buttons: ["OK"],
    defaultId: 0,
    noLink: true,
  };

  if (mainWindow === null) {
    await dialog.showMessageBox(options);
  } else {
    await dialog.showMessageBox(mainWindow, options);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: "#f6f1e7",
    title: "Chwezi Markdown Reader",
    icon: resolve(__dirname, "../../build-resources/icon.png"),
    webPreferences: {
      preload: resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(resolve(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = externalUrlSchema.safeParse(url);
    if (parsed.success) {
      void shell.openExternal(parsed.data);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingPath !== null) {
      mainWindow?.webContents.send("document:open-path", pendingPath);
      pendingPath = null;
    }
    scheduleVisualEvidenceCapture();
  });
  mainWindow.on("closed", () => {
    activeWatcher?.close();
    activeWatcher = null;
    mainWindow = null;
  });

  createApplicationMenu();
}

function scheduleVisualEvidenceCapture(): void {
  const lightCapturePath = process.env.MD_VIEWER_CAPTURE_PATH;
  const darkCapturePath = process.env.MD_VIEWER_CAPTURE_DARK_PATH;
  const clipboardCapturePath = process.env.MD_VIEWER_CAPTURE_CLIPBOARD_PATH;
  const clipboardTextCapturePath = process.env.MD_VIEWER_CAPTURE_CLIPBOARD_TEXT_PATH;
  if (
    lightCapturePath === undefined
    && darkCapturePath === undefined
    && clipboardCapturePath === undefined
    && clipboardTextCapturePath === undefined
  ) {
    return;
  }

  setTimeout(() => {
    void (async () => {
      if (mainWindow === null) {
        return;
      }
      if (lightCapturePath !== undefined) {
        const image = await mainWindow.webContents.capturePage();
        await writeFile(resolve(lightCapturePath), image.toPNG());
      }
      if (darkCapturePath !== undefined) {
        mainWindow.webContents.send("app:command", "theme");
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
        const image = await mainWindow.webContents.capturePage();
        await writeFile(resolve(darkCapturePath), image.toPNG());
      }
      if (clipboardCapturePath !== undefined || clipboardTextCapturePath !== undefined) {
        mainWindow.webContents.send("app:command", "copy-all");
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 250));
        if (clipboardCapturePath !== undefined) {
          await writeFile(resolve(clipboardCapturePath), clipboard.readHTML(), "utf8");
        }
        if (clipboardTextCapturePath !== undefined) {
          await writeFile(resolve(clipboardTextCapturePath), clipboard.readText(), "utf8");
        }
      }
      app.quit();
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Visual check failed", message);
      app.quit();
    });
  }, 1_200);
}

ipcMain.handle("dialog:open", async () => {
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
  return result.canceled || selectedPath === undefined ? null : loadDocument(selectedPath);
});

ipcMain.handle("document:read", (_event, filePath: unknown) => loadDocument(filePathSchema.parse(filePath)));
ipcMain.handle("clipboard:write-rich", (_event, payload: unknown) => {
  const parsed = clipboardPayloadSchema.parse(payload);
  clipboard.write({ html: parsed.html, text: parsed.text });
});
ipcMain.handle("clipboard:write-text", (_event, text: unknown) => {
  clipboard.writeText(z.string().max(10_000_000).parse(text));
});
ipcMain.handle("document:print", () => {
  if (mainWindow === null) {
    return false;
  }
  return new Promise<boolean>((resolvePrint) => {
    mainWindow?.webContents.print({ printBackground: true }, (success) => resolvePrint(success));
  });
});
ipcMain.handle("shell:open-external", async (_event, url: unknown) => {
  await shell.openExternal(externalUrlSchema.parse(url));
});
ipcMain.on("window:set-title", (_event, title: unknown) => {
  const parsed = z.string().min(1).max(260).safeParse(title);
  if (parsed.success) {
    mainWindow?.setTitle(parsed.data);
  }
});

const hasLock = app.requestSingleInstanceLock();

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  const requestedPath = resolve(filePath);
  if (mainWindow !== null && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("document:open-path", requestedPath);
  } else {
    pendingPath = requestedPath;
  }
});

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const requestedPath = findMarkdownArgument(commandLine);
    if (requestedPath !== null) {
      mainWindow?.webContents.send("document:open-path", requestedPath);
    }
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.chwezi.markdownreader");
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
