import DOMPurify from "dompurify";
import { marked } from "marked";

export interface RenderedMarkdown {
  readonly html: string;
  readonly wordCount: number;
  readonly readingMinutes: number;
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

export function renderMarkdown(markdown: string): RenderedMarkdown {
  const dirtyHtml = marked.parse(markdown, {
    async: false,
    breaks: false,
    gfm: true,
  });

  const html = DOMPurify.sanitize(dirtyHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["checked", "disabled"],
    FORBID_TAGS: ["style", "form", "iframe", "object", "embed", "script"],
    FORBID_ATTR: ["style"],
  });

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
    wordCount: words,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
  };
}
