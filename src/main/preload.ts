import { contextBridge, ipcRenderer, webUtils } from "electron";

interface DocumentPayload {
  readonly path: string;
  readonly fileUrl: string;
  readonly name: string;
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: number;
}

type AppCommand = "open" | "reload" | "print" | "copy-all" | "copy-markdown" | "find" | "theme" | "contents";

const api = {
  openFile: (): Promise<DocumentPayload | null> => ipcRenderer.invoke("dialog:open") as Promise<DocumentPayload | null>,
  readFile: (filePath: string): Promise<DocumentPayload> => ipcRenderer.invoke("document:read", filePath) as Promise<DocumentPayload>,
  getDroppedFilePath: (file: File): string => webUtils.getPathForFile(file),
  copyRich: (html: string, text: string): Promise<void> => ipcRenderer.invoke("clipboard:write-rich", { html, text }) as Promise<void>,
  copyText: (text: string): Promise<void> => ipcRenderer.invoke("clipboard:write-text", text) as Promise<void>,
  print: (): Promise<boolean> => ipcRenderer.invoke("document:print") as Promise<boolean>,
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:open-external", url) as Promise<void>,
  setTitle: (title: string): void => ipcRenderer.send("window:set-title", title),
  onOpenPath: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string): void => callback(filePath);
    ipcRenderer.on("document:open-path", listener);
    return () => ipcRenderer.removeListener("document:open-path", listener);
  },
  onFileChanged: (callback: (filePath: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, filePath: string): void => callback(filePath);
    ipcRenderer.on("document:changed", listener);
    return () => ipcRenderer.removeListener("document:changed", listener);
  },
  onCommand: (callback: (command: AppCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: AppCommand): void => callback(command);
    ipcRenderer.on("app:command", listener);
    return () => ipcRenderer.removeListener("app:command", listener);
  },
};

contextBridge.exposeInMainWorld("mdViewer", api);
