import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  appCommandSchema,
  appInfoSchema,
  appLimitsSchema,
  booleanResponseSchema,
  documentPayloadSchema,
  documentStateSchema,
  filePathSchema,
  folderFileRequestSchema,
  folderIdSchema,
  folderSearchRequestSchema,
  folderSearchResponseSchema,
  folderSnapshotSchema,
  htmlExportRequestSchema,
  IPC_CHANNELS,
  navigationResultSchema,
  readerSettingsPatchSchema,
  readerSettingsSchema,
  readingStateRequestSchema,
  readingStateSchema,
  recentFilesSchema,
  relativeNavigationRequestSchema,
  renderedDocumentPathSchema,
  remoteImagePolicySchema,
  pdfExportRequestSchema,
  type AppCommand,
  type AppInfo,
  type AppLimits,
  type DocumentPayload,
  type DocumentState,
  type FolderSearchRequest,
  type FolderSearchResponse,
  type FolderSnapshot,
  type HtmlExportRequest,
  type NavigationResult,
  type ReaderSettings,
  type ReaderSettingsPatch,
  type ReadingState,
  type RecentFile,
  type RemoteImagePolicy,
} from "./ipc-contracts";

async function parseInvocation<T>(promise: Promise<unknown>, schema: { parse(value: unknown): T }): Promise<T> {
  return schema.parse(await promise);
}

const api = {
  openFile: async (): Promise<DocumentPayload | null> => {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.dialogOpen) as unknown;
    return result === null ? null : documentPayloadSchema.parse(result);
  },
  openDroppedFile: (file: File): Promise<DocumentPayload> => {
    const filePath = webUtils.getPathForFile(file);
    if (filePath.length === 0) {
      return Promise.reject(new Error("This dropped item does not expose a local file path."));
    }
    return parseInvocation(
      ipcRenderer.invoke(IPC_CHANNELS.documentOpenDropped, filePath) as Promise<unknown>,
      documentPayloadSchema,
    );
  },
  readFile: (filePath: string): Promise<DocumentPayload> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.documentRead, filePathSchema.parse(filePath)) as Promise<unknown>,
    documentPayloadSchema,
  ),
  copyRich: (html: string, text: string): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.clipboardWriteRich,
    { html, text },
  ) as Promise<void>,
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.clipboardWriteText,
    text,
  ) as Promise<void>,
  print: (): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.documentPrint) as Promise<unknown>,
    booleanResponseSchema,
  ),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.shellOpenExternal,
    url,
  ) as Promise<void>,
  setTitle: (title: string): void => ipcRenderer.send(IPC_CHANNELS.windowSetTitle, title),
  rendererReady: (): void => ipcRenderer.send(IPC_CHANNELS.appRendererReady),
  notifyDocumentRendered: (documentPath: string | null): void => ipcRenderer.send(
    IPC_CHANNELS.appDocumentRendered,
    renderedDocumentPathSchema.parse(documentPath),
  ),
  notifyClipboardWritten: (): void => ipcRenderer.send(IPC_CHANNELS.appClipboardWritten),
  getAppInfo: (): Promise<AppInfo> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.appGetInfo) as Promise<unknown>,
    appInfoSchema,
  ),
  getLimits: (): Promise<AppLimits> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.appGetLimits) as Promise<unknown>,
    appLimitsSchema,
  ),
  getRemoteImagePolicy: (): Promise<RemoteImagePolicy> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.remoteImageGetPolicy) as Promise<unknown>,
    remoteImagePolicySchema,
  ),
  setRemoteImagePolicy: (policy: RemoteImagePolicy): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.remoteImageSetPolicy,
    remoteImagePolicySchema.parse(policy),
  ) as Promise<void>,
  getSettings: (): Promise<ReaderSettings> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as Promise<unknown>,
    readerSettingsSchema,
  ),
  updateSettings: (patch: ReaderSettingsPatch): Promise<ReaderSettings> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, readerSettingsPatchSchema.parse(patch)) as Promise<unknown>,
    readerSettingsSchema,
  ),
  getRecentFiles: (): Promise<RecentFile[]> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.recentGet) as Promise<unknown>,
    recentFilesSchema,
  ),
  clearRecentFiles: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.recentClear) as Promise<void>,
  openRecentFile: (filePath: string): Promise<DocumentPayload> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.recentOpen, filePathSchema.parse(filePath)) as Promise<unknown>,
    documentPayloadSchema,
  ),
  getReadingState: async (filePath: string): Promise<ReadingState | null> => {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.readingGetState, filePathSchema.parse(filePath)) as unknown;
    return result === null ? null : readingStateSchema.parse(result);
  },
  setReadingState: (filePath: string, state: ReadingState): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.readingSetState,
    readingStateRequestSchema.parse({ path: filePath, state }),
  ) as Promise<void>,
  openRelativeMarkdown: (href: string, currentPath: string): Promise<NavigationResult> => parseInvocation(
    ipcRenderer.invoke(
      IPC_CHANNELS.navigationOpenRelative,
      relativeNavigationRequestSchema.parse({ href, currentPath }),
    ) as Promise<unknown>,
    navigationResultSchema,
  ),
  openFolder: async (): Promise<FolderSnapshot | null> => {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.folderOpen) as unknown;
    return result === null ? null : folderSnapshotSchema.parse(result);
  },
  refreshFolder: (folderId: string): Promise<FolderSnapshot> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.folderRefresh, folderIdSchema.parse(folderId)) as Promise<unknown>,
    folderSnapshotSchema,
  ),
  closeFolder: (folderId: string): Promise<void> => ipcRenderer.invoke(
    IPC_CHANNELS.folderClose,
    folderIdSchema.parse(folderId),
  ) as Promise<void>,
  openFolderFile: (folderId: string, relativePath: string): Promise<DocumentPayload> => parseInvocation(
    ipcRenderer.invoke(
      IPC_CHANNELS.folderOpenFile,
      folderFileRequestSchema.parse({ folderId, relativePath }),
    ) as Promise<unknown>,
    documentPayloadSchema,
  ),
  searchFolder: (request: FolderSearchRequest): Promise<FolderSearchResponse> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.folderSearch, folderSearchRequestSchema.parse(request)) as Promise<unknown>,
    folderSearchResponseSchema,
  ),
  cancelFolderSearch: (requestId: string): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.folderCancelSearch, folderIdSchema.parse(requestId)) as Promise<unknown>,
    booleanResponseSchema,
  ),
  exportHtml: (request: HtmlExportRequest): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.exportHtml, htmlExportRequestSchema.parse(request)) as Promise<unknown>,
    booleanResponseSchema,
  ),
  exportPdf: (documentPath: string, suggestedName: string): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(
      IPC_CHANNELS.exportPdf,
      pdfExportRequestSchema.parse({ documentPath, suggestedName }),
    ) as Promise<unknown>,
    booleanResponseSchema,
  ),
  revealFile: (filePath: string): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.shellRevealFile, filePathSchema.parse(filePath)) as Promise<unknown>,
    booleanResponseSchema,
  ),
  openInExternalEditor: (filePath: string): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.shellOpenEditor, filePathSchema.parse(filePath)) as Promise<unknown>,
    booleanResponseSchema,
  ),
  toggleFullscreen: (): Promise<boolean> => parseInvocation(
    ipcRenderer.invoke(IPC_CHANNELS.windowToggleFullscreen) as Promise<unknown>,
    booleanResponseSchema,
  ),
  onOpenPath: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: unknown): void => {
      callback(filePathSchema.parse(filePath));
    };
    ipcRenderer.on(IPC_CHANNELS.documentOpenPath, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.documentOpenPath, listener);
  },
  onDocumentState: (callback: (state: DocumentState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      callback(documentStateSchema.parse(state));
    };
    ipcRenderer.on(IPC_CHANNELS.documentState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.documentState, listener);
  },
  onFileChanged: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      const parsed = documentStateSchema.parse(state);
      if (parsed.state !== "missing") {
        callback(parsed.path);
      }
    };
    ipcRenderer.on(IPC_CHANNELS.documentState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.documentState, listener);
  },
  onCommand: (callback: (command: AppCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: unknown): void => {
      callback(appCommandSchema.parse(command));
    };
    ipcRenderer.on(IPC_CHANNELS.appCommand, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appCommand, listener);
  },
  onAboutRequested: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.appAboutRequested, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.appAboutRequested, listener);
  },
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullscreen: unknown): void => {
      callback(booleanResponseSchema.parse(isFullscreen));
    };
    ipcRenderer.on(IPC_CHANNELS.windowFullscreenChanged, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.windowFullscreenChanged, listener);
  },
  onRecentFilesChanged: (callback: (files: RecentFile[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, files: unknown): void => {
      callback(recentFilesSchema.parse(files));
    };
    ipcRenderer.on(IPC_CHANNELS.recentFilesChanged, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.recentFilesChanged, listener);
  },
};

contextBridge.exposeInMainWorld("mdViewer", api);
