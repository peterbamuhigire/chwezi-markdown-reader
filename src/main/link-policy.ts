import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { filePathSchema } from "./ipc-contracts";

export interface RelativeMarkdownTarget {
  readonly path: string;
  readonly fragment: string | null;
}

function isWithinDirectory(parentDirectory: string, candidatePath: string): boolean {
  const traversal = relative(parentDirectory, candidatePath);
  return traversal === "" || (!traversal.startsWith("..") && !isAbsolute(traversal));
}

export function resolveRelativeMarkdownTarget(href: string, currentPath: string): RelativeMarkdownTarget {
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0 || trimmedHref.length > 8_192) {
    throw new Error("This document link is empty or too long.");
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmedHref) || trimmedHref.startsWith("//") || trimmedHref.startsWith("\\\\")) {
    throw new Error("Only relative Markdown document links can open inside the reader.");
  }

  const canonicalCurrentPath = resolve(filePathSchema.parse(currentPath));
  const currentDirectory = dirname(canonicalCurrentPath);
  const parsed = new URL(trimmedHref, pathToFileURL(canonicalCurrentPath));
  if (parsed.protocol !== "file:" || parsed.search.length > 0) {
    throw new Error("Only relative Markdown paths and fragments can open inside the reader.");
  }

  const targetPath = resolve(fileURLToPath(parsed));
  filePathSchema.parse(targetPath);
  if (!isWithinDirectory(currentDirectory, targetPath)) {
    throw new Error("This link points outside the current document folder.");
  }

  let fragment: string | null = null;
  if (parsed.hash.length > 1) {
    try {
      fragment = decodeURIComponent(parsed.hash.slice(1));
    } catch {
      throw new Error("This document link contains an invalid fragment.");
    }
  }
  if (fragment !== null && fragment.length > 4_096) {
    throw new Error("This document link fragment is too long.");
  }
  return { path: targetPath, fragment };
}

export function assertCanonicalTargetWithinDocumentFolder(currentPath: string, targetPath: string): void {
  if (!isWithinDirectory(dirname(resolve(currentPath)), resolve(targetPath))) {
    throw new Error("This link resolves outside the current document folder.");
  }
}
