import DOMPurify from "dompurify";
import { marked } from "marked";
import { extractFrontMatter, type FrontMatterField } from "./front-matter";

export type RemoteImagePolicy = "allow" | "block";

interface RenderMarkdownOptions {
  readonly remoteImages?: RemoteImagePolicy;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly frontMatter: readonly FrontMatterField[];
  readonly wordCount: number;
  readonly readingMinutes: number;
  readonly remoteImageCount: number;
}

export function slugifyHeading(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export function isMarkdownFilename(filename: string): boolean {
  return /\.(?:md|markdown|mdown|mkd)$/i.test(filename);
}

export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): RenderedMarkdown {
  const document = extractFrontMatter(markdown);
  const dirtyHtml = marked.parse(document.body, {
    async: false,
    breaks: false,
    gfm: true,
  });

  let remoteImageCount = 0;
  const remoteImagePolicy = options.remoteImages ?? "block";
  const remoteImageHook = (element: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }): void => {
    if (element.tagName !== "IMG" || data.attrName !== "src" || !/^(?:https?:)?\/\//i.test(data.attrValue)) {
      return;
    }
    remoteImageCount += 1;
    if (remoteImagePolicy === "block") {
      element.setAttribute("data-chwezi-remote-src", data.attrValue);
      data.keepAttr = false;
    }
  };

  DOMPurify.addHook("uponSanitizeAttribute", remoteImageHook);

  let html: string;
  try {
    html = DOMPurify.sanitize(dirtyHtml, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["checked", "disabled", "data-chwezi-remote-src"],
      FORBID_TAGS: ["style", "form", "iframe", "object", "embed", "script"],
      FORBID_ATTR: ["style"],
    });
  } finally {
    DOMPurify.removeHook("uponSanitizeAttribute", remoteImageHook);
  }

  const words = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/g, " ")
    .replace(/[#>*_~|\-]+/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;

  return {
    html,
    frontMatter: document.fields,
    wordCount: words,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
    remoteImageCount,
  };
}
