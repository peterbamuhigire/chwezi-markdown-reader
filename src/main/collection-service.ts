import { randomUUID } from "node:crypto";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  folderIdSchema,
  folderRelativePathSchema,
  folderSearchRequestSchema,
  folderSearchResponseSchema,
  folderSnapshotSchema,
  MARKDOWN_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_DOCUMENTS,
  MAX_FOLDER_ENTRIES,
  MAX_FOLDER_SEARCH_BYTES,
  MAX_FOLDER_SEARCH_RESULTS,
  type FolderEntry,
  type FolderSearchRequest,
  type FolderSearchResponse,
  type FolderSnapshot,
} from "./ipc-contracts";
import { decodeMarkdownBytes } from "./document-service";

interface FolderGrant {
  readonly rootPath: string;
  readonly name: string;
}

interface MarkdownFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly name: string;
}

interface DirectoryWork {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly depth: number;
}

interface TreeWork extends DirectoryWork {
  readonly kind: "root" | "folder" | "document";
  readonly name: string;
}

interface MarkdownFileList {
  readonly documents: readonly MarkdownFile[];
  readonly truncated: boolean;
  readonly skippedFiles: number;
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("The folder search was cancelled.");
  error.name = "AbortError";
  return error;
}

async function readMarkdownBytesBounded(filePath: string, signal: AbortSignal): Promise<Buffer> {
  const handle = await open(filePath, "r");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes <= MAX_DOCUMENT_BYTES) {
      if (signal.aborted) {
        throw abortError();
      }
      const chunkSize = Math.min(1024 * 1024, (MAX_DOCUMENT_BYTES + 1) - totalBytes);
      const chunk = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

function isWithinDirectory(rootPath: string, candidatePath: string): boolean {
  const traversal = relative(rootPath, candidatePath);
  return traversal === "" || (!traversal.startsWith("..") && !isAbsolute(traversal));
}

function pathKey(filePath: string): string {
  const absolutePath = resolve(filePath);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase() : absolutePath;
}

async function resolveTraversalDirectory(rootPath: string, candidatePath: string): Promise<string> {
  const canonicalPath = await realpath(candidatePath);
  if (!isWithinDirectory(rootPath, canonicalPath)) {
    throw new Error("A folder entry resolves outside the open folder.");
  }
  return canonicalPath;
}

function toPortableRelativePath(rootPath: string, absolutePath: string): string {
  return folderRelativePathSchema.parse(relative(rootPath, absolutePath).split(sep).join("/"));
}

function fromPortableRelativePath(rootPath: string, portablePath: string): string {
  const segments = folderRelativePathSchema.parse(portablePath).split("/");
  return resolve(rootPath, ...segments);
}

function compareNames(left: { readonly name: string }, right: { readonly name: string }): number {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function isMarkdownName(name: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(name).toLocaleLowerCase());
}

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{M}\p{N}_]/u.test(value);
}

function hasWholeWordBoundaries(content: string, index: number, matchLength: number): boolean {
  const before = content.slice(Math.max(0, index - 2), index);
  const after = content.slice(index + matchLength, index + matchLength + 2);
  const previousCharacter = Array.from(before).at(-1) ?? "";
  const nextCharacter = Array.from(after)[0] ?? "";
  return !isWordCharacter(previousCharacter) && !isWordCharacter(nextCharacter);
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createLineStarts(content: string): readonly number[] {
  const starts = [0];
  let nextNewline = content.indexOf("\n");
  while (nextNewline !== -1) {
    starts.push(nextNewline + 1);
    nextNewline = content.indexOf("\n", nextNewline + 1);
  }
  return starts;
}

function lineIndexAt(lineStarts: readonly number[], matchIndex: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = lineStarts[middle] ?? 0;
    if (start <= matchIndex) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, high);
}

function createSnippet(
  content: string,
  matchIndex: number,
  lineStarts: readonly number[],
): { line: number; column: number; snippet: string } {
  const lineIndex = lineIndexAt(lineStarts, matchIndex);
  const line = lineIndex + 1;
  const lineStart = lineStarts[lineIndex] ?? 0;
  const lineEndCandidate = content.indexOf("\n", matchIndex);
  const lineEnd = lineEndCandidate === -1 ? content.length : lineEndCandidate;
  const lineText = content.slice(lineStart, lineEnd).replace(/\r$/u, "");
  const column = matchIndex - lineStart + 1;
  const matchColumn = matchIndex - lineStart;
  const windowStart = Math.max(0, matchColumn - 100);
  const windowEnd = Math.min(lineText.length, matchColumn + 300);
  const snippet = `${windowStart > 0 ? "..." : ""}${lineText.slice(windowStart, windowEnd)}${windowEnd < lineText.length ? "..." : ""}`;
  return { line, column, snippet };
}

export class CollectionService {
  private readonly grants = new Map<string, FolderGrant>();
  private readonly searches = new Map<string, { readonly folderId: string; readonly controller: AbortController }>();

  public async openFolder(untrustedPath: unknown): Promise<FolderSnapshot> {
    if (typeof untrustedPath !== "string" || untrustedPath.length === 0 || untrustedPath.length > 32_767) {
      throw new Error("Choose a local folder containing Markdown documents.");
    }
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(resolve(untrustedPath));
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw new Error("This folder is no longer available.");
      }
      if (code === "EACCES" || code === "EPERM") {
        throw new Error("Chwezi Markdown Reader does not have permission to open this folder.");
      }
      throw error;
    }
    const rootStats = await stat(canonicalRoot);
    if (!rootStats.isDirectory()) {
      throw new Error("The selected path is not a folder.");
    }
    const id = folderIdSchema.parse(randomUUID());
    this.grants.set(id, { rootPath: canonicalRoot, name: basename(canonicalRoot) || canonicalRoot });
    try {
      return await this.getSnapshot(id);
    } catch (error: unknown) {
      this.grants.delete(id);
      throw error;
    }
  }

  public async getSnapshot(untrustedFolderId: unknown): Promise<FolderSnapshot> {
    const folderId = folderIdSchema.parse(untrustedFolderId);
    const grant = this.requireGrant(folderId);
    const entries: FolderEntry[] = [];
    let documentCount = 0;
    let inspectedEntryCount = 0;
    let truncated = false;
    const pending: TreeWork[] = [{
      absolutePath: grant.rootPath,
      relativePath: "",
      depth: 0,
      kind: "root",
      name: grant.name,
    }];

    enumeration: while (pending.length > 0) {
      const item = pending.pop();
      if (item === undefined) {
        break;
      }
      if (item.kind === "document") {
        if (entries.length >= MAX_FOLDER_ENTRIES || documentCount >= MAX_FOLDER_DOCUMENTS) {
          truncated = true;
          break;
        }
        entries.push({ relativePath: item.relativePath, name: item.name, kind: "document", depth: item.depth });
        documentCount += 1;
        continue;
      }
      if (item.kind === "folder") {
        if (entries.length >= MAX_FOLDER_ENTRIES) {
          truncated = true;
          break;
        }
        entries.push({ relativePath: item.relativePath, name: item.name, kind: "folder", depth: item.depth });
      }
      if (item.depth >= MAX_FOLDER_DEPTH) {
        truncated = true;
        continue;
      }
      let children;
      try {
        const canonicalDirectory = await resolveTraversalDirectory(grant.rootPath, item.absolutePath);
        if (item.kind === "root" && pathKey(canonicalDirectory) !== pathKey(grant.rootPath)) {
          throw new Error("The open folder changed location and must be opened again.");
        }
        children = await readdir(canonicalDirectory, { withFileTypes: true });
      } catch (error: unknown) {
        if (item.kind === "root") {
          const code = errorCode(error);
          if (code === "EACCES" || code === "EPERM") {
            throw new Error("Chwezi Markdown Reader does not have permission to read this folder.");
          }
          throw error;
        }
        truncated = true;
        continue;
      }
      children.sort(compareNames);
      const childWork: TreeWork[] = [];
      for (const child of children) {
        inspectedEntryCount += 1;
        if (inspectedEntryCount > MAX_FOLDER_ENTRIES) {
          truncated = true;
          break enumeration;
        }
        if (child.isSymbolicLink()) {
          continue;
        }
        const kind = child.isDirectory()
          ? "folder"
          : child.isFile() && isMarkdownName(child.name) ? "document" : null;
        if (kind === null) {
          continue;
        }
        const relativePath = item.relativePath === "" ? child.name : `${item.relativePath}/${child.name}`;
        const parsedRelativePath = folderRelativePathSchema.safeParse(relativePath);
        if (!parsedRelativePath.success) {
          truncated = true;
          continue;
        }
        childWork.push({
          absolutePath: resolve(item.absolutePath, child.name),
          relativePath: parsedRelativePath.data,
          depth: item.depth + 1,
          kind,
          name: child.name,
        });
      }
      for (let index = childWork.length - 1; index >= 0; index -= 1) {
        const child = childWork[index];
        if (child !== undefined) {
          pending.push(child);
        }
      }
    }

    return folderSnapshotSchema.parse({ id: folderId, name: grant.name, entries, documentCount, truncated });
  }

  public closeFolder(untrustedFolderId: unknown): void {
    const folderId = folderIdSchema.parse(untrustedFolderId);
    this.grants.delete(folderId);
    for (const [requestId, search] of this.searches) {
      if (search.folderId === folderId) {
        search.controller.abort();
        this.searches.delete(requestId);
      }
    }
  }

  public closeAll(): void {
    for (const search of this.searches.values()) {
      search.controller.abort();
    }
    this.searches.clear();
    this.grants.clear();
  }

  public async resolveDocument(untrustedFolderId: unknown, untrustedRelativePath: unknown): Promise<string> {
    const folderId = folderIdSchema.parse(untrustedFolderId);
    const grant = this.requireGrant(folderId);
    const candidatePath = fromPortableRelativePath(grant.rootPath, folderRelativePathSchema.parse(untrustedRelativePath));
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(candidatePath);
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw new Error("This Markdown document is no longer in the open folder.");
      }
      if (code === "EACCES" || code === "EPERM") {
        throw new Error("Chwezi Markdown Reader does not have permission to open this document.");
      }
      throw error;
    }
    if (!isWithinDirectory(grant.rootPath, canonicalPath)) {
      throw new Error("This document resolves outside the open folder.");
    }
    if (!isMarkdownName(canonicalPath) || !(await stat(canonicalPath)).isFile()) {
      throw new Error("Choose a Markdown document inside the open folder.");
    }
    return canonicalPath;
  }

  public async searchFolder(untrustedRequest: unknown): Promise<FolderSearchResponse> {
    const request = folderSearchRequestSchema.parse(untrustedRequest);
    if (this.searches.has(request.requestId)) {
      throw new Error("A folder search with this request identifier is already running.");
    }
    const grant = this.requireGrant(request.folderId);
    const controller = new AbortController();
    this.searches.set(request.requestId, { folderId: request.folderId, controller });
    try {
      return await this.performSearch(request, grant, controller.signal);
    } finally {
      this.searches.delete(request.requestId);
    }
  }

  public cancelSearch(untrustedRequestId: unknown): boolean {
    const requestId = folderIdSchema.parse(untrustedRequestId);
    const search = this.searches.get(requestId);
    if (search === undefined) {
      return false;
    }
    search.controller.abort();
    return true;
  }

  private requireGrant(folderId: string): FolderGrant {
    const grant = this.grants.get(folderId);
    if (grant === undefined) {
      throw new Error("Open this folder again before accessing its documents.");
    }
    return grant;
  }

  private async listMarkdownFiles(grant: FolderGrant, signal: AbortSignal): Promise<MarkdownFileList> {
    const documents: MarkdownFile[] = [];
    let traversedEntries = 0;
    let skippedFiles = 0;
    let truncated = false;
    const pending: DirectoryWork[] = [{ absolutePath: grant.rootPath, relativePath: "", depth: 0 }];

    traversal: while (pending.length > 0) {
      if (signal.aborted) {
        break;
      }
      const directory = pending.shift();
      if (directory === undefined) {
        break;
      }
      if (directory.depth >= MAX_FOLDER_DEPTH) {
        truncated = true;
        continue;
      }
      let children;
      try {
        const canonicalDirectory = await resolveTraversalDirectory(grant.rootPath, directory.absolutePath);
        if (directory.depth === 0 && pathKey(canonicalDirectory) !== pathKey(grant.rootPath)) {
          throw new Error("The open folder changed location and must be opened again.");
        }
        children = await readdir(canonicalDirectory, { withFileTypes: true });
      } catch (error: unknown) {
        if (directory.depth === 0) {
          throw error;
        }
        skippedFiles += 1;
        continue;
      }
      children.sort(compareNames);
      for (const child of children) {
        traversedEntries += 1;
        if (traversedEntries > MAX_FOLDER_ENTRIES) {
          truncated = true;
          break traversal;
        }
        if (child.isSymbolicLink()) {
          continue;
        }
        const depth = directory.depth + 1;
        const absolutePath = resolve(directory.absolutePath, child.name);
        const relativePath = directory.relativePath === "" ? child.name : `${directory.relativePath}/${child.name}`;
        if (child.isDirectory()) {
          const parsedRelativePath = folderRelativePathSchema.safeParse(relativePath);
          if (!parsedRelativePath.success) {
            truncated = true;
            continue;
          }
          if (depth <= MAX_FOLDER_DEPTH) {
            pending.push({ absolutePath, relativePath: parsedRelativePath.data, depth });
          } else {
            truncated = true;
          }
        } else if (child.isFile() && isMarkdownName(child.name)) {
          const parsedRelativePath = folderRelativePathSchema.safeParse(relativePath);
          if (!parsedRelativePath.success) {
            skippedFiles += 1;
            truncated = true;
            continue;
          }
          if (documents.length >= MAX_FOLDER_DOCUMENTS) {
            truncated = true;
            break traversal;
          }
          documents.push({
            absolutePath,
            relativePath: parsedRelativePath.data,
            name: child.name,
          });
        }
      }
    }
    return { documents, truncated, skippedFiles };
  }

  private async performSearch(
    request: FolderSearchRequest,
    grant: FolderGrant,
    signal: AbortSignal,
  ): Promise<FolderSearchResponse> {
    const listed = await this.listMarkdownFiles(grant, signal);
    const flags = request.matchCase ? "gu" : "giu";
    const matcher = new RegExp(escapeRegularExpression(request.query), flags);
    const results: FolderSearchResponse["results"][number][] = [];
    let scannedFiles = 0;
    let skippedFiles = listed.skippedFiles;
    let totalBytes = 0;
    let truncated = listed.truncated;

    for (const document of listed.documents) {
      if (signal.aborted) {
        break;
      }
      try {
        const canonicalPath = await realpath(document.absolutePath);
        if (!isWithinDirectory(grant.rootPath, canonicalPath)) {
          skippedFiles += 1;
          continue;
        }
        const fileStats = await stat(canonicalPath);
        if (!fileStats.isFile() || fileStats.size > MAX_DOCUMENT_BYTES) {
          skippedFiles += 1;
          continue;
        }
        if (totalBytes + fileStats.size > MAX_FOLDER_SEARCH_BYTES) {
          truncated = true;
          break;
        }
        const bytes = await readMarkdownBytesBounded(canonicalPath, signal);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_FOLDER_SEARCH_BYTES) {
          truncated = true;
          break;
        }
        const content = decodeMarkdownBytes(bytes);
        scannedFiles += 1;
        const lineStarts = createLineStarts(content);
        for (const match of content.matchAll(matcher)) {
          const matchIndex = match.index;
          const matchedText = match[0];
          if (matchIndex === undefined || matchedText.length === 0) {
            continue;
          }
          if (request.wholeWord && !hasWholeWordBoundaries(content, matchIndex, matchedText.length)) {
            continue;
          }
          results.push({
            relativePath: toPortableRelativePath(grant.rootPath, canonicalPath),
            name: document.name,
            ...createSnippet(content, matchIndex, lineStarts),
          });
          if (results.length >= MAX_FOLDER_SEARCH_RESULTS) {
            truncated = true;
            break;
          }
        }
        if (results.length >= MAX_FOLDER_SEARCH_RESULTS) {
          break;
        }
      } catch (error: unknown) {
        if (isAbortError(error)) {
          break;
        }
        skippedFiles += 1;
      }
    }

    return folderSearchResponseSchema.parse({
      requestId: request.requestId,
      results,
      scannedFiles,
      skippedFiles,
      truncated,
      cancelled: signal.aborted,
    });
  }
}
