import "./styles.css";
import { isMarkdownFilename, renderMarkdown, slugifyHeading } from "./markdown";

type Theme = "light" | "dark";

interface ClipboardContent {
  readonly html: string;
  readonly text: string;
}

const STYLE_PROPERTIES = [
  "background-color",
  "border",
  "border-bottom",
  "border-collapse",
  "border-left",
  "border-radius",
  "border-right",
  "border-spacing",
  "border-top",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
] as const;

function requireElement<T extends HTMLElement>(
  selector: string,
  constructor: new (...argumentsList: never[]) => T,
): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Required interface element is missing: ${selector}`);
  }
  return element;
}

const appShell = requireElement("#app-shell", HTMLDivElement);
const reader = requireElement("#reader", HTMLElement);
const article = requireElement("#markdown-body", HTMLElement);
const emptyState = requireElement("#empty-state", HTMLDivElement);
const loadingState = requireElement("#loading-state", HTMLDivElement);
const errorState = requireElement("#error-state", HTMLDivElement);
const errorMessage = requireElement("#error-message", HTMLParagraphElement);
const documentName = requireElement("#document-name", HTMLElement);
const documentMeta = requireElement("#document-meta", HTMLElement);
const statusMessage = requireElement("#status-message", HTMLElement);
const progressBar = requireElement("#reading-progress", HTMLElement);
const contentsList = requireElement("#contents-list", HTMLElement);
const contentsEmpty = requireElement("#contents-empty", HTMLDivElement);
const openButton = requireElement("#open-button", HTMLButtonElement);
const emptyOpenButton = requireElement("#empty-open-button", HTMLButtonElement);
const errorOpenButton = requireElement("#error-open-button", HTMLButtonElement);
const copyButton = requireElement("#copy-button", HTMLButtonElement);
const printButton = requireElement("#print-button", HTMLButtonElement);
const themeButton = requireElement("#theme-button", HTMLButtonElement);
const contentsButton = requireElement("#contents-button", HTMLButtonElement);
const searchBar = requireElement("#search-bar", HTMLDivElement);
const searchInput = requireElement("#search-input", HTMLInputElement);
const searchCount = requireElement("#search-count", HTMLElement);
const searchPrevious = requireElement("#search-previous", HTMLButtonElement);
const searchNext = requireElement("#search-next", HTMLButtonElement);
const searchClose = requireElement("#search-close", HTMLButtonElement);
const dropOverlay = requireElement("#drop-overlay", HTMLDivElement);
const toast = requireElement("#toast", HTMLDivElement);
const documentBase = requireElement("#document-base", HTMLBaseElement);

let currentDocument: DocumentPayload | null = null;
let toastTimer: number | null = null;
let dragDepth = 0;
let searchRanges: Range[] = [];
let activeSearchIndex = -1;

function initialTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("theme", theme);
  const nextTheme = theme === "light" ? "dark" : "light";
  themeButton.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  themeButton.title = `Switch to ${nextTheme} mode (Ctrl+Shift+L)`;
}

function toggleTheme(): void {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function showToast(message: string): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toastTimer = null;
  }, 2600);
}

function describeError(error: unknown): string {
  if (!(error instanceof Error) || error.message.trim() === "") {
    return "The file may have moved, or Windows may have denied access.";
  }
  if (/ENOENT|no such file|could not find/i.test(error.message)) {
    return "The file is no longer at the location Windows provided.";
  }
  if (/EACCES|EPERM|permission denied|access is denied/i.test(error.message)) {
    return "Windows denied access to this file. Check its permissions and try again.";
  }
  if (/20 MB|not a file|Choose a Markdown file/i.test(error.message)) {
    return error.message.replace(/^Error invoking remote method '[^']+': Error: /, "");
  }
  return "Chwezi Markdown Reader could not read this file. Try opening it again or confirm that it contains text Markdown.";
}

function showLoading(): void {
  emptyState.hidden = true;
  errorState.hidden = true;
  article.hidden = true;
  loadingState.hidden = false;
  statusMessage.textContent = "Opening…";
}

function showError(error: unknown): void {
  loadingState.hidden = true;
  emptyState.hidden = true;
  article.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = describeError(error);
  statusMessage.textContent = "Open failed";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildContents(): void {
  contentsList.replaceChildren();
  const headings = Array.from(article.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"));
  const usedSlugs = new Map<string, number>();

  for (const heading of headings) {
    const text = heading.textContent?.trim() ?? "";
    if (text === "") {
      continue;
    }
    const baseSlug = slugifyHeading(text);
    const occurrence = usedSlugs.get(baseSlug) ?? 0;
    usedSlugs.set(baseSlug, occurrence + 1);
    const id = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence + 1}`;
    heading.id = id;

    const link = document.createElement("button");
    link.type = "button";
    link.className = `contents-link level-${heading.tagName.slice(1)}`;
    link.textContent = text;
    link.title = text;
    link.addEventListener("click", () => heading.scrollIntoView({ behavior: "smooth", block: "start" }));
    contentsList.append(link);
  }

  contentsEmpty.hidden = contentsList.childElementCount > 0;
}

function enhanceRenderedContent(): void {
  buildContents();

  for (const anchor of article.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const rawHref = anchor.getAttribute("href");
    if (rawHref === null) {
      continue;
    }
    anchor.addEventListener("click", (event) => {
      if (rawHref.startsWith("#")) {
        return;
      }
      event.preventDefault();
      void window.mdViewer.openExternal(anchor.href).catch((error: unknown) => showToast(describeError(error)));
    });
  }

  for (const image of article.querySelectorAll<HTMLImageElement>("img")) {
    image.addEventListener("error", () => {
      image.classList.add("image-error");
      image.alt = image.alt === "" ? "Image could not be loaded" : `${image.alt} (could not be loaded)`;
    });
  }
}

function displayDocument(payload: DocumentPayload, reloaded = false): void {
  const rendered = renderMarkdown(payload.content);
  currentDocument = payload;
  documentBase.href = payload.path === "" ? "./" : new URL(".", payload.fileUrl).toString();
  article.innerHTML = rendered.html; // HTML is sanitized by DOMPurify in renderMarkdown.
  enhanceRenderedContent();

  loadingState.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  article.hidden = false;
  copyButton.disabled = false;
  printButton.disabled = false;
  documentName.textContent = payload.name;
  const modified = new Date(payload.modifiedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  documentMeta.textContent = `${formatBytes(payload.size)} · ${rendered.wordCount.toLocaleString()} words · ${rendered.readingMinutes} min read`;
  statusMessage.textContent = `Modified ${modified}`;
  window.mdViewer.setTitle(`${payload.name} — Chwezi Markdown Reader`);
  clearSearch();
  reader.scrollTop = 0;
  updateReadingProgress();

  if (reloaded) {
    showToast("Updated from disk");
  }
}

async function openFile(): Promise<void> {
  try {
    const payload = await window.mdViewer.openFile();
    if (payload !== null) {
      showLoading();
      displayDocument(payload);
    }
  } catch (error: unknown) {
    showError(error);
  }
}

async function openPath(filePath: string, reloaded = false): Promise<void> {
  showLoading();
  try {
    displayDocument(await window.mdViewer.readFile(filePath), reloaded);
  } catch (error: unknown) {
    showError(error);
  }
}

function inlineComputedStyles(sourceElements: readonly HTMLElement[], cloneElements: readonly HTMLElement[]): void {
  const pairs = Math.min(sourceElements.length, cloneElements.length);
  for (let index = 0; index < pairs; index += 1) {
    const source = sourceElements[index];
    const clone = cloneElements[index];
    if (source === undefined || clone === undefined) {
      continue;
    }
    const computed = getComputedStyle(source);
    for (const property of STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value !== "") {
        clone.style.setProperty(property, value);
      }
    }
    clone.removeAttribute("id");
  }
}

function createClipboardContent(range: Range | null): ClipboardContent {
  const wrapper = document.createElement("div");
  const articleStyle = getComputedStyle(article);
  wrapper.style.backgroundColor = articleStyle.backgroundColor;
  wrapper.style.color = articleStyle.color;
  wrapper.style.fontFamily = articleStyle.fontFamily;
  wrapper.style.fontSize = articleStyle.fontSize;
  wrapper.style.lineHeight = articleStyle.lineHeight;
  wrapper.style.padding = "24px";
  wrapper.style.maxWidth = "820px";

  if (range === null) {
    const clone = article.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      throw new Error("The rendered document could not be copied.");
    }
    const sourceElements = [article, ...article.querySelectorAll<HTMLElement>("*")];
    const cloneElements = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
    inlineComputedStyles(sourceElements, cloneElements);
    clone.style.margin = "0";
    clone.style.boxShadow = "none";
    wrapper.append(...clone.childNodes);
    return { html: wrapper.outerHTML, text: currentDocument?.content ?? article.innerText };
  }

  const fragment = range.cloneContents();
  const cloneContainer = document.createElement("div");
  cloneContainer.append(fragment);
  const sourceElements = Array.from(article.querySelectorAll<HTMLElement>("*")).filter((element) => {
    try {
      return range.intersectsNode(element);
    } catch {
      return false;
    }
  });
  const cloneElements = Array.from(cloneContainer.querySelectorAll<HTMLElement>("*"));
  inlineComputedStyles(sourceElements, cloneElements);
  wrapper.append(...cloneContainer.childNodes);
  return { html: wrapper.outerHTML, text: range.toString() };
}

async function copyRenderedDocument(): Promise<void> {
  if (currentDocument === null) {
    return;
  }
  try {
    const content = createClipboardContent(null);
    await window.mdViewer.copyRich(content.html, content.text);
    showToast("Rendered document copied");
  } catch (error: unknown) {
    showToast(describeError(error));
  }
}

async function copyMarkdownSource(): Promise<void> {
  if (currentDocument === null) {
    return;
  }
  try {
    await window.mdViewer.copyText(currentDocument.content);
    showToast("Markdown source copied");
  } catch (error: unknown) {
    showToast(describeError(error));
  }
}

function selectionInsideArticle(selection: Selection): Range | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const commonNode = range.commonAncestorContainer;
  const commonElement = commonNode instanceof Element ? commonNode : commonNode.parentElement;
  return commonElement !== null && article.contains(commonElement) ? range : null;
}

function clearSearch(): void {
  searchRanges = [];
  activeSearchIndex = -1;
  const cssWithHighlights = CSS as typeof CSS & { highlights?: { clear(): void } };
  cssWithHighlights.highlights?.clear();
  searchCount.textContent = "0 results";
}

function runSearch(): void {
  clearSearch();
  const query = searchInput.value.trim().toLocaleLowerCase();
  if (query === "" || currentDocument === null) {
    return;
  }

  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    const text = node.textContent ?? "";
    const lowerText = text.toLocaleLowerCase();
    let start = lowerText.indexOf(query);
    while (start !== -1) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + query.length);
      searchRanges.push(range);
      start = lowerText.indexOf(query, start + query.length);
    }
    node = walker.nextNode();
  }

  const cssWithHighlights = CSS as typeof CSS & {
    highlights?: { set(name: string, highlight: Highlight): void };
  };
  if (searchRanges.length > 0 && cssWithHighlights.highlights !== undefined) {
    cssWithHighlights.highlights.set("search-results", new Highlight(...searchRanges));
    activeSearchIndex = 0;
    scrollToSearchResult();
  }
  updateSearchCount();
}

function updateSearchCount(): void {
  searchCount.textContent = searchRanges.length === 0
    ? "0 results"
    : `${activeSearchIndex + 1} of ${searchRanges.length}`;
}

function scrollToSearchResult(): void {
  const range = searchRanges[activeSearchIndex];
  if (range === undefined) {
    return;
  }
  const element = range.startContainer.parentElement;
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function stepSearch(direction: 1 | -1): void {
  if (searchRanges.length === 0) {
    return;
  }
  activeSearchIndex = (activeSearchIndex + direction + searchRanges.length) % searchRanges.length;
  updateSearchCount();
  scrollToSearchResult();
}

function showSearch(): void {
  searchBar.hidden = false;
  searchInput.focus();
  searchInput.select();
}

function hideSearch(): void {
  searchBar.hidden = true;
  clearSearch();
  reader.focus();
}

function toggleContents(): void {
  appShell.classList.toggle("contents-collapsed");
}

async function printDocument(): Promise<void> {
  if (currentDocument === null) {
    return;
  }
  try {
    const printed = await window.mdViewer.print();
    if (!printed) {
      statusMessage.textContent = "Print cancelled";
    }
  } catch (error: unknown) {
    showToast(describeError(error));
  }
}

function updateReadingProgress(): void {
  const maximum = reader.scrollHeight - reader.clientHeight;
  const progress = maximum <= 0 ? 0 : Math.min(100, (reader.scrollTop / maximum) * 100);
  progressBar.style.width = `${progress}%`;
}

async function openDroppedFile(file: File): Promise<void> {
  if (!isMarkdownFilename(file.name)) {
    showToast("Drop a Markdown file: .md, .markdown, .mdown, or .mkd");
    return;
  }
  const filePath = window.mdViewer.getDroppedFilePath(file);
  if (filePath !== "") {
    await openPath(filePath);
    return;
  }
  showLoading();
  try {
    const content = await file.text();
    displayDocument({
      path: "",
      fileUrl: "about:blank",
      name: file.name,
      content,
      size: file.size,
      modifiedAt: file.lastModified,
    });
  } catch (error: unknown) {
    showError(error);
  }
}

function handleCommand(command: AppCommand): void {
  switch (command) {
    case "open": void openFile(); break;
    case "reload": if (currentDocument?.path) void openPath(currentDocument.path, true); break;
    case "print": void printDocument(); break;
    case "copy-all": void copyRenderedDocument(); break;
    case "copy-markdown": void copyMarkdownSource(); break;
    case "find": showSearch(); break;
    case "theme": toggleTheme(); break;
    case "contents": toggleContents(); break;
  }
}

openButton.addEventListener("click", () => void openFile());
emptyOpenButton.addEventListener("click", () => void openFile());
errorOpenButton.addEventListener("click", () => void openFile());
copyButton.addEventListener("click", () => void copyRenderedDocument());
printButton.addEventListener("click", () => void printDocument());
themeButton.addEventListener("click", toggleTheme);
contentsButton.addEventListener("click", toggleContents);
searchInput.addEventListener("input", runSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    stepSearch(event.shiftKey ? -1 : 1);
  } else if (event.key === "Escape") {
    hideSearch();
  }
});
searchPrevious.addEventListener("click", () => stepSearch(-1));
searchNext.addEventListener("click", () => stepSearch(1));
searchClose.addEventListener("click", hideSearch);
reader.addEventListener("scroll", updateReadingProgress, { passive: true });

document.addEventListener("copy", (event) => {
  if (currentDocument === null) {
    return;
  }
  const selection = window.getSelection();
  if (selection === null) {
    return;
  }
  const range = selectionInsideArticle(selection);
  if (range === null) {
    return;
  }
  event.preventDefault();
  try {
    const content = createClipboardContent(range);
    event.clipboardData?.setData("text/html", content.html);
    event.clipboardData?.setData("text/plain", content.text);
    showToast("Selection copied with formatting");
  } catch (error: unknown) {
    showToast(describeError(error));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !searchBar.hidden) {
    hideSearch();
  }
});

document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
});
document.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer !== null) {
    event.dataTransfer.dropEffect = "copy";
  }
});
document.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dropOverlay.hidden = true;
  }
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) {
    void openDroppedFile(file);
  }
});

window.mdViewer.onOpenPath((filePath) => void openPath(filePath));
window.mdViewer.onFileChanged((filePath) => {
  if (currentDocument?.path === filePath) {
    void openPath(filePath, true);
  }
});
window.mdViewer.onCommand(handleCommand);

applyTheme(initialTheme());
appShell.classList.toggle("contents-collapsed", window.innerWidth < 900);
