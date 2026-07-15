import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  htmlExportRequestSchema,
  MAX_EXPORT_HTML_BYTES,
  MAX_EXPORT_RESOURCE_BYTES,
  type HtmlExportRequest,
} from "./ipc-contracts";

const IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const ACTIVE_ELEMENT_PATTERN = /^<\s*\/?\s*(?:base|body|button|embed|form|head|html|iframe|link|math|meta|object|script|style|svg|title)\b/iu;
const INPUT_ELEMENT_PATTERN = /^<\s*input\b/iu;
const CHECKBOX_TYPE_PATTERN = /\btype\s*=\s*["']?checkbox(?:["'\s>])/iu;
const DISABLED_ATTRIBUTE_PATTERN = /\sdisabled(?:\s*=\s*(?:["'](?:disabled)?["']|disabled))?(?:\s|\/?>)/iu;
const ACTIVE_ATTRIBUTE_PATTERN = /\son[a-z]+\s*=|\b(?:action|background|formaction|poster|srcset)\s*=|\bstyle\s*=\s*["'][^"']*(?:@import|url\s*\()|\bhref\s*=\s*["']\s*(?:data|file|javascript):|\bsrc\s*=\s*["']\s*(?:file|https?):|\bsrc\s*=\s*["']\s*\/\//iu;
const REMOTE_CSS_PATTERN = /@import\b|url\(\s*["']?\s*(?:file:|https?:|\/\/)/iu;

function isWithinDirectory(rootPath: string, candidatePath: string): boolean {
  const traversal = relative(rootPath, candidatePath);
  return traversal === "" || (!traversal.startsWith("..") && !isAbsolute(traversal));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function replaceEvery(value: string, token: string, replacement: string): string {
  return value.split(token).join(replacement);
}

function* htmlTags(markup: string): Generator<string> {
  let cursor = 0;
  while (cursor < markup.length) {
    const tagStart = markup.indexOf("<", cursor);
    if (tagStart === -1) {
      return;
    }
    let quote: "\"" | "'" | null = null;
    let tagEnd = tagStart + 1;
    for (; tagEnd < markup.length; tagEnd += 1) {
      const character = markup[tagEnd];
      if (quote !== null) {
        if (character === quote) {
          quote = null;
        }
      } else if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === ">") {
        yield markup.slice(tagStart, tagEnd + 1);
        cursor = tagEnd + 1;
        break;
      }
    }
    if (tagEnd >= markup.length) {
      throw new Error("The rendered document contains incomplete HTML that cannot be exported safely.");
    }
  }
}

function assertPassiveExportMarkup(bodyHtml: string, css: string): void {
  for (const tag of htmlTags(bodyHtml)) {
    if (ACTIVE_ELEMENT_PATTERN.test(tag) || ACTIVE_ATTRIBUTE_PATTERN.test(tag)) {
      throw new Error("The rendered document contains active or non-self-contained HTML that cannot be exported safely.");
    }
    if (INPUT_ELEMENT_PATTERN.test(tag) && (!CHECKBOX_TYPE_PATTERN.test(tag) || !DISABLED_ATTRIBUTE_PATTERN.test(tag))) {
      throw new Error("Only disabled task-list checkboxes can be included in an HTML export.");
    }
  }
  if (REMOTE_CSS_PATTERN.test(css)) {
    throw new Error("The export stylesheet refers to a local or remote resource.");
  }
  if (/<\s*\/\s*style\b/iu.test(css)) {
    throw new Error("The export stylesheet contains markup that would break out of the generated style element.");
  }
  if (/data:image\/svg\+xml/iu.test(bodyHtml) || /data:image\/svg\+xml/iu.test(css)) {
    throw new Error("SVG images cannot be embedded safely in this HTML export. Convert the SVG to PNG or WebP first.");
  }
}

export function normaliseExportFileName(untrustedName: string, extension: ".html" | ".pdf"): string {
  const withoutPath = untrustedName.replace(/[\\/]/gu, "-").trim();
  const withoutControlCharacters = withoutPath.replace(/[\u0000-\u001f\u007f]/gu, "");
  const withoutReservedCharacters = process.platform === "win32"
    ? withoutControlCharacters.replace(/[<>:"|?*]/gu, "-").replace(/[. ]+$/gu, "")
    : withoutControlCharacters;
  const baseName = withoutReservedCharacters.replace(/\.(?:html?|pdf|md|markdown|mdown|mkd)$/iu, "").trim() || "Markdown document";
  return `${baseName.slice(0, 220)}${extension}`;
}

export function ensureExportExtension(filePath: string, extension: ".html" | ".pdf"): string {
  return filePath.toLocaleLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`;
}

export async function buildSelfContainedHtml(
  untrustedRequest: unknown,
  canonicalDocumentPath: string,
): Promise<string> {
  const request = htmlExportRequestSchema.parse(untrustedRequest) as HtmlExportRequest;
  assertPassiveExportMarkup(request.bodyHtml, request.css);
  const documentDirectory = dirname(await realpath(canonicalDocumentPath));
  const seenTokens = new Set<string>();
  let bodyHtml = request.bodyHtml;
  let css = request.css;
  let embeddedBytes = 0;

  for (const resource of request.resources) {
    if (seenTokens.has(resource.token)) {
      throw new Error("Each HTML export resource must have a unique placeholder.");
    }
    seenTokens.add(resource.token);
    if (!bodyHtml.includes(resource.token) && !css.includes(resource.token)) {
      throw new Error("An HTML export resource does not have a matching placeholder.");
    }
    const resourceUrl = new URL(resource.fileUrl);
    if (resourceUrl.protocol !== "file:" || resourceUrl.search !== "" || resourceUrl.hash !== "") {
      throw new Error("Only local image files can be embedded in an HTML export.");
    }
    const canonicalResourcePath = await realpath(fileURLToPath(resourceUrl));
    if (!isWithinDirectory(documentDirectory, canonicalResourcePath)) {
      throw new Error("An export image resolves outside the active document folder.");
    }
    const resourceExtension = extname(canonicalResourcePath).toLocaleLowerCase();
    if (resourceExtension === ".svg") {
      throw new Error("SVG images cannot be embedded safely in this HTML export. Convert the SVG to PNG or WebP first.");
    }
    const mediaType = IMAGE_MEDIA_TYPES[resourceExtension];
    if (mediaType === undefined) {
      throw new Error("Only supported local image formats can be embedded in an HTML export.");
    }
    const resourceStats = await stat(canonicalResourcePath);
    if (!resourceStats.isFile() || resourceStats.size > MAX_EXPORT_RESOURCE_BYTES) {
      throw new Error("An export image is not a file or exceeds the 16 MB per-image limit.");
    }
    const bytes = await readFile(canonicalResourcePath);
    if (bytes.byteLength > MAX_EXPORT_RESOURCE_BYTES) {
      throw new Error("An export image grew beyond the 16 MB per-image limit while it was being read.");
    }
    embeddedBytes += bytes.byteLength;
    if (embeddedBytes > MAX_EXPORT_HTML_BYTES) {
      throw new Error("Embedded images exceed the 64 MB HTML export limit.");
    }
    const dataUrl = `data:${mediaType};base64,${bytes.toString("base64")}`;
    bodyHtml = replaceEvery(bodyHtml, resource.token, dataUrl);
    css = replaceEvery(css, resource.token, dataUrl);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>${escapeHtml(request.title)}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
  if (Buffer.byteLength(html, "utf8") > MAX_EXPORT_HTML_BYTES) {
    throw new Error("The self-contained HTML exceeds the 64 MB export limit.");
  }
  return html;
}

export async function writeExportFile(filePath: string, contents: string | Uint8Array): Promise<void> {
  await writeFile(resolve(filePath), contents, { flag: "w", mode: 0o600 });
}
