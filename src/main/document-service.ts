import { readFile, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { basename, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";
import {
  filePathSchema,
  MAX_DOCUMENT_BYTES,
  type DocumentPayload,
} from "./ipc-contracts";
import {
  assertCanonicalTargetWithinDocumentFolder,
  resolveRelativeMarkdownTarget,
} from "./link-policy";

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

function pathKey(filePath: string): string {
  const absolutePath = resolve(filePath);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase() : absolutePath;
}

async function canonicalPath(untrustedPath: unknown): Promise<string> {
  const absolutePath = resolve(filePathSchema.parse(untrustedPath));
  try {
    return filePathSchema.parse(await realpath(absolutePath));
  } catch (error: unknown) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new Error("This file is no longer available at its previous location.");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new Error("Chwezi Markdown Reader does not have permission to open this file.");
    }
    throw error;
  }
}

async function statDocument(filePath: string): Promise<Stats> {
  try {
    return await stat(filePath);
  } catch (error: unknown) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new Error("This file is no longer available at its previous location.");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new Error("Chwezi Markdown Reader does not have permission to open this file.");
    }
    throw error;
  }
}

export function decodeMarkdownBytes(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("This Markdown file grew beyond the 20 MB reading limit while it was being opened.");
  }
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe)
    || (bytes[0] === 0xfe && bytes[1] === 0xff)
  ) {
    throw new Error("This file is UTF-16. Save it as UTF-8 before opening it in Chwezi Markdown Reader.");
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("This file is not valid UTF-8. Save it as UTF-8 and try again.");
  }
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

export class DocumentService {
  private readonly grantedPaths = new Set<string>();

  public async grant(untrustedPath: unknown): Promise<string> {
    const parsedPath = resolve(filePathSchema.parse(untrustedPath));
    let grantedPath = parsedPath;
    try {
      grantedPath = filePathSchema.parse(await realpath(parsedPath));
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw error;
      }
      // Preserve an explicit OS/user grant for a missing path so recreation at
      // the same location remains recoverable without granting other files.
    }
    this.grantedPaths.add(pathKey(grantedPath));
    this.grantedPaths.add(pathKey(parsedPath));
    return grantedPath;
  }

  public async resolveGranted(untrustedPath: unknown): Promise<string> {
    const absolutePath = await canonicalPath(untrustedPath);
    if (!this.grantedPaths.has(pathKey(absolutePath))) {
      throw new Error("Open this Markdown file through the file picker, drag and drop, or the operating system first.");
    }
    return absolutePath;
  }

  public async openRelative(href: string, untrustedCurrentPath: unknown): Promise<{
    document: DocumentPayload;
    fragment: string | null;
  }> {
    const currentPath = await this.resolveGranted(untrustedCurrentPath);
    const target = resolveRelativeMarkdownTarget(href, currentPath);
    const canonicalTarget = await canonicalPath(target.path);
    assertCanonicalTargetWithinDocumentFolder(currentPath, canonicalTarget);
    this.grantedPaths.add(pathKey(canonicalTarget));
    this.grantedPaths.add(pathKey(target.path));
    return { document: await this.load(canonicalTarget), fragment: target.fragment };
  }

  public async load(untrustedPath: unknown): Promise<DocumentPayload> {
    const absolutePath = await this.resolveGranted(untrustedPath);

    const initialStats = await statDocument(absolutePath);
    if (!initialStats.isFile()) {
      throw new Error("The selected path is not a file.");
    }
    if (initialStats.size > MAX_DOCUMENT_BYTES) {
      throw new Error("This Markdown file is larger than the 20 MB reading limit.");
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch (error: unknown) {
      const code = errorCode(error);
      if (code === "ENOENT" || code === "ENOTDIR") {
        throw new Error("This file changed location while it was being opened. Try again.");
      }
      if (code === "EACCES" || code === "EPERM") {
        throw new Error("Chwezi Markdown Reader does not have permission to read this file.");
      }
      throw error;
    }
    const content = decodeMarkdownBytes(bytes);

    const finalStats = await statDocument(absolutePath);
    return {
      path: absolutePath,
      fileUrl: pathToFileURL(absolutePath).toString(),
      name: basename(absolutePath),
      content,
      size: bytes.byteLength,
      modifiedAt: finalStats.mtimeMs,
    };
  }
}
