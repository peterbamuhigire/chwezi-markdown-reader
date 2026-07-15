import { z } from "zod";

export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CLIPBOARD_HTML_BYTES = 32 * 1024 * 1024;
export const MAX_CLIPBOARD_TEXT_BYTES = 20 * 1024 * 1024;
export const MAX_EXPORT_HTML_BYTES = 64 * 1024 * 1024;
export const MAX_EXPORT_RESOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_EXPORT_RESOURCES = 256;
export const MAX_FOLDER_ENTRIES = 10_000;
export const MAX_FOLDER_DOCUMENTS = 5_000;
export const MAX_FOLDER_DEPTH = 32;
export const MAX_FOLDER_SEARCH_RESULTS = 200;
export const MAX_FOLDER_SEARCH_BYTES = 100 * 1024 * 1024;

function extensionOf(filePath: string): string {
  const lastSeparator = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const lastDot = filePath.lastIndexOf(".");
  return lastDot > lastSeparator ? filePath.slice(lastDot).toLowerCase() : "";
}

export const IPC_CHANNELS = {
  appAboutRequested: "app:about-requested",
  appCommand: "app:command",
  appClipboardWritten: "app:clipboard-written",
  appGetInfo: "app:get-info",
  appGetLimits: "app:get-limits",
  appRendererReady: "app:renderer-ready",
  appDocumentRendered: "app:document-rendered",
  clipboardWriteRich: "clipboard:write-rich",
  clipboardWriteText: "clipboard:write-text",
  dialogOpen: "dialog:open",
  documentOpenDropped: "document:open-dropped",
  documentOpenPath: "document:open-path",
  documentPrint: "document:print",
  documentRead: "document:read",
  documentState: "document:state",
  exportHtml: "export:html",
  exportPdf: "export:pdf",
  folderCancelSearch: "folder:cancel-search",
  folderClose: "folder:close",
  folderOpen: "folder:open",
  folderOpenFile: "folder:open-file",
  folderRefresh: "folder:refresh",
  folderSearch: "folder:search",
  navigationOpenRelative: "navigation:open-relative",
  readingGetState: "reading:get-state",
  readingSetState: "reading:set-state",
  recentClear: "recent:clear",
  recentFilesChanged: "recent:files-changed",
  recentGet: "recent:get",
  recentOpen: "recent:open",
  remoteImageGetPolicy: "remote-image:get-policy",
  remoteImageSetPolicy: "remote-image:set-policy",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  shellOpenEditor: "shell:open-editor",
  shellOpenExternal: "shell:open-external",
  shellRevealFile: "shell:reveal-file",
  windowFullscreenChanged: "window:fullscreen-changed",
  windowSetTitle: "window:set-title",
  windowToggleFullscreen: "window:toggle-fullscreen",
} as const;

export const filePathSchema = z
  .string()
  .min(1)
  .max(32_767)
  .refine((value) => MARKDOWN_EXTENSIONS.has(extensionOf(value)), {
    message: "Choose a Markdown file (.md, .markdown, .mdown, or .mkd).",
  });

export const documentPayloadSchema = z.object({
  path: filePathSchema,
  fileUrl: z.string().url(),
  name: z.string().min(1).max(32_767),
  content: z.string(),
  size: z.number().int().nonnegative().max(MAX_DOCUMENT_BYTES),
  modifiedAt: z.number().finite().nonnegative(),
});

function hasAtMostUtf8Bytes(value: string, limit: number): boolean {
  return new TextEncoder().encode(value).byteLength <= limit;
}

export const clipboardPayloadSchema = z.object({
  html: z.string().refine(
    (value) => hasAtMostUtf8Bytes(value, MAX_CLIPBOARD_HTML_BYTES),
    `Rendered HTML exceeds the ${MAX_CLIPBOARD_HTML_BYTES / 1024 / 1024} MB clipboard limit.`,
  ),
  text: z.string().refine(
    (value) => hasAtMostUtf8Bytes(value, MAX_CLIPBOARD_TEXT_BYTES),
    `Text exceeds the ${MAX_CLIPBOARD_TEXT_BYTES / 1024 / 1024} MB clipboard limit.`,
  ),
});

export const clipboardTextSchema = z.string().refine(
  (value) => hasAtMostUtf8Bytes(value, MAX_CLIPBOARD_TEXT_BYTES),
  `Text exceeds the ${MAX_CLIPBOARD_TEXT_BYTES / 1024 / 1024} MB clipboard limit.`,
);

export const externalUrlSchema = z.string().max(8_192).refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}, "Only web and email links can be opened.");

export const windowTitleSchema = z.string().min(1).max(260);
export const remoteImagePolicySchema = z.enum(["block", "allow"]);
export const documentStateSchema = z.object({
  path: filePathSchema,
  state: z.enum(["changed", "missing", "restored"]),
});
export const renderedDocumentPathSchema = filePathSchema.nullable();
export const booleanResponseSchema = z.boolean();
export const appCommandSchema = z.enum([
  "open",
  "reload",
  "print",
  "copy-all",
  "copy-markdown",
  "find",
  "theme",
  "contents",
  "back",
  "forward",
  "reveal",
  "open-editor",
  "open-folder",
  "export-html",
  "export-pdf",
]);
export const appInfoSchema = z.object({ version: z.string().min(1) });
export const appLimitsSchema = z.object({
  maxDocumentBytes: z.number().int().positive(),
  maxClipboardHtmlBytes: z.number().int().positive(),
  maxClipboardTextBytes: z.number().int().positive(),
});

export const readerSettingsSchema = z.object({
  fontFamily: z.enum(["serif", "sans", "system"]),
  fontSize: z.number().min(14).max(24),
  lineHeight: z.number().min(1.4).max(2),
  readingWidth: z.number().int().min(620).max(1_080),
  paragraphSpacing: z.number().min(0.7).max(1.8),
  reopenLastDocument: z.boolean(),
}).strict();
export const readerSettingsPatchSchema = readerSettingsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Change at least one reader setting.",
);
export const recentFileSchema = z.object({
  path: filePathSchema,
  name: z.string().min(1).max(32_767),
  lastOpenedAt: z.number().int().nonnegative(),
}).strict();
export const recentFilesSchema = z.array(recentFileSchema).max(12);
export const readingStateSchema = z.object({
  headingId: z.string().max(1_024).nullable(),
  headingOffset: z.number().finite().min(-100_000).max(100_000),
  scrollRatio: z.number().finite().min(0).max(1),
}).strict();
export const readingStateRequestSchema = z.object({
  path: filePathSchema,
  state: readingStateSchema,
}).strict();
export const relativeNavigationRequestSchema = z.object({
  href: z.string().min(1).max(8_192),
  currentPath: filePathSchema,
}).strict();
export const navigationResultSchema = z.object({
  document: documentPayloadSchema,
  fragment: z.string().max(4_096).nullable(),
}).strict();

export const folderIdSchema = z.string().uuid();
export const folderRelativePathSchema = z.string().min(1).max(4_096).refine((value) => {
  if (value.includes("\\") || value.includes(":") || value.startsWith("/") || value.includes("\0")) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "Choose an item inside the open folder.");
export const folderEntrySchema = z.object({
  relativePath: folderRelativePathSchema,
  name: z.string().min(1).max(1_024),
  kind: z.enum(["folder", "document"]),
  depth: z.number().int().min(1).max(MAX_FOLDER_DEPTH),
}).strict();
export const folderSnapshotSchema = z.object({
  id: folderIdSchema,
  name: z.string().min(1).max(1_024),
  entries: z.array(folderEntrySchema).max(MAX_FOLDER_ENTRIES),
  documentCount: z.number().int().nonnegative().max(MAX_FOLDER_DOCUMENTS),
  truncated: z.boolean(),
}).strict();
export const folderFileRequestSchema = z.object({
  folderId: folderIdSchema,
  relativePath: folderRelativePathSchema,
}).strict();
export const folderSearchRequestSchema = z.object({
  requestId: z.string().uuid(),
  folderId: folderIdSchema,
  query: z.string().min(1).max(256),
  matchCase: z.boolean(),
  wholeWord: z.boolean(),
}).strict();
export const folderSearchMatchSchema = z.object({
  relativePath: folderRelativePathSchema,
  name: z.string().min(1).max(1_024),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  snippet: z.string().max(500),
}).strict();
export const folderSearchResponseSchema = z.object({
  requestId: z.string().uuid(),
  results: z.array(folderSearchMatchSchema).max(MAX_FOLDER_SEARCH_RESULTS),
  scannedFiles: z.number().int().nonnegative().max(MAX_FOLDER_DOCUMENTS),
  skippedFiles: z.number().int().nonnegative().max(MAX_FOLDER_ENTRIES),
  truncated: z.boolean(),
  cancelled: z.boolean(),
}).strict();

export const exportResourceSchema = z.object({
  token: z.string().regex(/^__CHWEZI_RESOURCE_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_\d{4}__$/u),
  fileUrl: z.string().url().max(32_767),
}).strict();
export const htmlExportRequestSchema = z.object({
  documentPath: filePathSchema,
  title: z.string().min(1).max(1_024),
  bodyHtml: z.string().refine(
    (value) => hasAtMostUtf8Bytes(value, MAX_EXPORT_HTML_BYTES),
    "The rendered document is too large to export as HTML.",
  ),
  css: z.string().refine(
    (value) => hasAtMostUtf8Bytes(value, 4 * 1024 * 1024),
    "The export stylesheet is too large.",
  ),
  resources: z.array(exportResourceSchema).max(MAX_EXPORT_RESOURCES),
}).strict();
export const pdfExportRequestSchema = z.object({
  documentPath: filePathSchema,
  suggestedName: z.string().min(1).max(260),
}).strict();

export type AppCommand = z.infer<typeof appCommandSchema>;
export type AppInfo = z.infer<typeof appInfoSchema>;
export type AppLimits = z.infer<typeof appLimitsSchema>;
export type DocumentPayload = z.infer<typeof documentPayloadSchema>;
export type DocumentState = z.infer<typeof documentStateSchema>;
export type FolderEntry = z.infer<typeof folderEntrySchema>;
export type FolderSearchRequest = z.infer<typeof folderSearchRequestSchema>;
export type FolderSearchResponse = z.infer<typeof folderSearchResponseSchema>;
export type FolderSnapshot = z.infer<typeof folderSnapshotSchema>;
export type HtmlExportRequest = z.infer<typeof htmlExportRequestSchema>;
export type NavigationResult = z.infer<typeof navigationResultSchema>;
export type ReaderSettings = z.infer<typeof readerSettingsSchema>;
export type ReaderSettingsPatch = z.infer<typeof readerSettingsPatchSchema>;
export type ReadingState = z.infer<typeof readingStateSchema>;
export type RecentFile = z.infer<typeof recentFileSchema>;
export type RemoteImagePolicy = z.infer<typeof remoteImagePolicySchema>;
