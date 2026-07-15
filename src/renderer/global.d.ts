interface DocumentPayload {
  readonly path: string;
  readonly fileUrl: string;
  readonly name: string;
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: number;
}

interface DocumentStateEvent {
  readonly path: string;
  readonly state: "changed" | "missing" | "restored";
}

interface RecentFile {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: number;
}

interface FolderEntry {
  readonly relativePath: string;
  readonly name: string;
  readonly kind: "folder" | "document";
  readonly depth: number;
}

interface FolderSnapshot {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly FolderEntry[];
  readonly documentCount: number;
  readonly truncated: boolean;
}

interface FolderSearchResult {
  readonly relativePath: string;
  readonly name: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
}

interface FolderSearchResponse {
  readonly requestId: string;
  readonly results: readonly FolderSearchResult[];
  readonly scannedFiles: number;
  readonly skippedFiles: number;
  readonly truncated: boolean;
  readonly cancelled: boolean;
}

interface HtmlExportRequest {
  readonly documentPath: string;
  readonly title: string;
  readonly bodyHtml: string;
  readonly css: string;
  readonly resources: readonly { readonly token: string; readonly fileUrl: string }[];
}

type AppCommand = "open" | "reload" | "print" | "copy-all" | "copy-markdown" | "find" | "theme" | "contents" | "back" | "forward" | "reveal" | "open-editor" | "open-folder" | "export-html" | "export-pdf";

interface Window {
  readonly mdViewer: {
    openFile(): Promise<DocumentPayload | null>;
    readFile(filePath: string): Promise<DocumentPayload>;
    openDroppedFile(file: File): Promise<DocumentPayload>;
    copyRich(html: string, text: string): Promise<void>;
    copyText(text: string): Promise<void>;
    print(): Promise<boolean>;
    openExternal(url: string): Promise<void>;
    setTitle(title: string): void;
    rendererReady(): void;
    notifyDocumentRendered(documentPath: string | null): void;
    notifyClipboardWritten(): void;
    getRemoteImagePolicy(): Promise<"block" | "allow">;
    setRemoteImagePolicy(policy: "block" | "allow"): Promise<void>;
    getAppInfo(): Promise<{ readonly version: string }>;
    getLimits(): Promise<{
      readonly maxDocumentBytes: number;
      readonly maxClipboardHtmlBytes: number;
      readonly maxClipboardTextBytes: number;
    }>;
    getSettings(): Promise<import("./reader-settings").ReaderSettings>;
    updateSettings(patch: Partial<import("./reader-settings").ReaderSettings>): Promise<import("./reader-settings").ReaderSettings>;
    getRecentFiles(): Promise<RecentFile[]>;
    clearRecentFiles(): Promise<void>;
    openRecentFile(filePath: string): Promise<DocumentPayload>;
    getReadingState(filePath: string): Promise<{
      readonly headingId: string | null;
      readonly headingOffset: number;
      readonly scrollRatio: number;
    } | null>;
    setReadingState(filePath: string, state: {
      readonly headingId: string | null;
      readonly headingOffset: number;
      readonly scrollRatio: number;
    }): Promise<void>;
    openRelativeMarkdown(href: string, currentPath: string): Promise<{
      readonly document: DocumentPayload;
      readonly fragment: string | null;
    }>;
    revealFile(filePath: string): Promise<boolean>;
    openInExternalEditor(filePath: string): Promise<boolean>;
    openFolder(): Promise<FolderSnapshot | null>;
    refreshFolder(folderId: string): Promise<FolderSnapshot>;
    closeFolder(folderId: string): Promise<void>;
    openFolderFile(folderId: string, relativePath: string): Promise<DocumentPayload>;
    searchFolder(request: {
      readonly requestId: string;
      readonly folderId: string;
      readonly query: string;
      readonly matchCase: boolean;
      readonly wholeWord: boolean;
    }): Promise<FolderSearchResponse>;
    cancelFolderSearch(requestId: string): Promise<boolean>;
    exportHtml(request: HtmlExportRequest): Promise<boolean>;
    exportPdf(documentPath: string, suggestedName: string): Promise<boolean>;
    toggleFullscreen(): Promise<boolean>;
    onOpenPath(callback: (filePath: string) => void): () => void;
    onDocumentState(callback: (event: DocumentStateEvent) => void): () => void;
    onCommand(callback: (command: AppCommand) => void): () => void;
    onAboutRequested(callback: () => void): () => void;
    onFullscreenChanged(callback: (isFullscreen: boolean) => void): () => void;
    onRecentFilesChanged(callback: (files: RecentFile[]) => void): () => void;
  };
}
