interface DocumentPayload {
  readonly path: string;
  readonly fileUrl: string;
  readonly name: string;
  readonly content: string;
  readonly size: number;
  readonly modifiedAt: number;
}

type AppCommand = "open" | "reload" | "print" | "copy-all" | "copy-markdown" | "find" | "theme" | "contents";

interface Window {
  readonly mdViewer: {
    openFile(): Promise<DocumentPayload | null>;
    readFile(filePath: string): Promise<DocumentPayload>;
    getDroppedFilePath(file: File): string;
    copyRich(html: string, text: string): Promise<void>;
    copyText(text: string): Promise<void>;
    print(): Promise<boolean>;
    openExternal(url: string): Promise<void>;
    setTitle(title: string): void;
    onOpenPath(callback: (filePath: string) => void): () => void;
    onFileChanged(callback: (filePath: string) => void): () => void;
    onCommand(callback: (command: AppCommand) => void): () => void;
  };
}
