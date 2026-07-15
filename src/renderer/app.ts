import "./styles.css";
import { isMarkdownFilename, renderMarkdown, slugifyHeading, type RemoteImagePolicy } from "./markdown";
import { NavigationHistory, type NavigationEntry } from "./navigation-history";
import {
  applyReaderSettings,
  DEFAULT_READER_SETTINGS,
  normaliseReaderSettings,
  type ReaderFont,
  type ReaderSettings,
} from "./reader-settings";
import { findTextMatches, isRelativeMarkdownHref } from "./search";
import { enhanceCodeBlocks } from "./syntax-highlighting";
import { createStandaloneHtmlPayload } from "./html-export";

type Theme = "light" | "dark";

interface ClipboardContent {
  readonly html: string;
  readonly text: string;
}

interface SelectionSnapshot {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface ReadingSnapshot {
  readonly activeSearchIndex: number;
  readonly headingId: string | null;
  readonly headingOffset: number;
  readonly scrollRatio: number;
  readonly searchQuery: string;
  readonly selection: SelectionSnapshot | null;
}

interface SearchMatch {
  range: Range;
  fallbackMark: HTMLElement | null;
}

interface PersistedReadingState {
  readonly headingId: string | null;
  readonly headingOffset: number;
  readonly scrollRatio: number;
}

type DocumentHistoryEntry = NavigationEntry<DocumentPayload, ReadingSnapshot>;

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
const contentsFilter = requireElement("#contents-filter", HTMLInputElement);
const openButton = requireElement("#open-button", HTMLButtonElement);
const openFolderButton = requireElement("#open-folder-button", HTMLButtonElement);
const emptyOpenButton = requireElement("#empty-open-button", HTMLButtonElement);
const errorOpenButton = requireElement("#error-open-button", HTMLButtonElement);
const copyButton = requireElement("#copy-button", HTMLButtonElement);
const printButton = requireElement("#print-button", HTMLButtonElement);
const themeButton = requireElement("#theme-button", HTMLButtonElement);
const fullscreenButton = requireElement("#fullscreen-button", HTMLButtonElement);
const aboutButton = requireElement("#about-button", HTMLButtonElement);
const appearanceButton = requireElement("#appearance-button", HTMLButtonElement);
const backButton = requireElement("#back-button", HTMLButtonElement);
const forwardButton = requireElement("#forward-button", HTMLButtonElement);
const recentButton = requireElement("#recent-button", HTMLButtonElement);
const revealButton = requireElement("#reveal-button", HTMLButtonElement);
const editorButton = requireElement("#editor-button", HTMLButtonElement);
const exportHtmlButton = requireElement("#export-html-button", HTMLButtonElement);
const exportPdfButton = requireElement("#export-pdf-button", HTMLButtonElement);
const documentActions = requireElement("#document-actions", HTMLDetailsElement);
const backToTop = requireElement("#back-to-top", HTMLButtonElement);
const contentsButton = requireElement("#contents-button", HTMLButtonElement);
const searchBar = requireElement("#search-bar", HTMLDivElement);
const searchInput = requireElement("#search-input", HTMLInputElement);
const searchCount = requireElement("#search-count", HTMLElement);
const searchPrevious = requireElement("#search-previous", HTMLButtonElement);
const searchNext = requireElement("#search-next", HTMLButtonElement);
const searchClose = requireElement("#search-close", HTMLButtonElement);
const searchMatchCase = requireElement("#search-match-case", HTMLInputElement);
const searchWholeWord = requireElement("#search-whole-word", HTMLInputElement);
const dropOverlay = requireElement("#drop-overlay", HTMLDivElement);
const toast = requireElement("#toast", HTMLDivElement);
const documentBase = requireElement("#document-base", HTMLBaseElement);
const remoteImageBanner = requireElement("#remote-image-banner", HTMLElement);
const remoteImageTitle = requireElement("#remote-image-title", HTMLElement);
const remoteImageMessage = requireElement("#remote-image-message", HTMLElement);
const remoteImagesOnce = requireElement("#remote-images-once", HTMLButtonElement);
const remoteImagesAlways = requireElement("#remote-images-always", HTMLButtonElement);
const remoteImagesBlock = requireElement("#remote-images-block", HTMLButtonElement);
const aboutDialog = requireElement("#about-dialog", HTMLDialogElement);
const aboutClose = requireElement("#about-close", HTMLButtonElement);
const aboutDone = requireElement("#about-done", HTMLButtonElement);
const aboutEmail = requireElement("#about-email", HTMLButtonElement);
const aboutVersion = requireElement("#about-version", HTMLElement);
const recentDialog = requireElement("#recent-dialog", HTMLDialogElement);
const recentList = requireElement("#recent-list", HTMLDivElement);
const recentEmpty = requireElement("#recent-empty", HTMLParagraphElement);
const recentClose = requireElement("#recent-close", HTMLButtonElement);
const recentDone = requireElement("#recent-done", HTMLButtonElement);
const recentClear = requireElement("#recent-clear", HTMLButtonElement);
const reopenLast = requireElement("#reopen-last", HTMLInputElement);
const appearanceDialog = requireElement("#appearance-dialog", HTMLDialogElement);
const appearanceClose = requireElement("#appearance-close", HTMLButtonElement);
const appearanceDone = requireElement("#appearance-done", HTMLButtonElement);
const appearanceReset = requireElement("#appearance-reset", HTMLButtonElement);
const readerFont = requireElement("#reader-font", HTMLSelectElement);
const fontSize = requireElement("#font-size", HTMLInputElement);
const fontSizeValue = requireElement("#font-size-value", HTMLOutputElement);
const lineHeight = requireElement("#line-height", HTMLInputElement);
const lineHeightValue = requireElement("#line-height-value", HTMLOutputElement);
const readingWidth = requireElement("#reading-width", HTMLInputElement);
const readingWidthValue = requireElement("#reading-width-value", HTMLOutputElement);
const paragraphSpacing = requireElement("#paragraph-spacing", HTMLInputElement);
const paragraphSpacingValue = requireElement("#paragraph-spacing-value", HTMLOutputElement);
const outlineTab = requireElement("#outline-tab", HTMLButtonElement);
const libraryTab = requireElement("#library-tab", HTMLButtonElement);
const outlinePanel = requireElement("#outline-panel", HTMLElement);
const libraryPanel = requireElement("#library-panel", HTMLElement);
const libraryName = requireElement("#library-name", HTMLElement);
const libraryChoose = requireElement("#library-choose", HTMLButtonElement);
const libraryRefresh = requireElement("#library-refresh", HTMLButtonElement);
const libraryClose = requireElement("#library-close", HTMLButtonElement);
const librarySearch = requireElement("#library-search", HTMLFormElement);
const librarySearchInput = requireElement("#library-search-input", HTMLInputElement);
const librarySearchCancel = requireElement("#library-search-cancel", HTMLButtonElement);
const libraryMatchCase = requireElement("#library-match-case", HTMLInputElement);
const libraryWholeWord = requireElement("#library-whole-word", HTMLInputElement);
const libraryStatus = requireElement("#library-status", HTMLParagraphElement);
const libraryFiles = requireElement("#library-files", HTMLElement);
const libraryResults = requireElement("#library-results", HTMLDivElement);

let currentDocument: DocumentPayload | null = null;
let toastTimer: number | null = null;
let dragDepth = 0;
let searchMatches: SearchMatch[] = [];
let activeSearchIndex = -1;
let isFullscreen = false;
let remoteImagePolicy: RemoteImagePolicy = "block";
let allowRemoteImagesForCurrentDocument = false;
let queuedOpen = Promise.resolve();
let pendingRecoverySnapshot: ReadingSnapshot | null = null;
let readerSettings: ReaderSettings = DEFAULT_READER_SETTINGS;
let settingsSaveTimer: number | null = null;
let readingStateSaveTimer: number | null = null;
let currentFolder: FolderSnapshot | null = null;
let activeFolderSearchId: string | null = null;
let folderSearchQuery = "";
let folderSearchOptions = { matchCase: false, wholeWord: false };
let folderRenderGeneration = 0;
const navigationHistory = new NavigationHistory<DocumentPayload, ReadingSnapshot>(50);

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
    return "The file may have moved, or the operating system may have denied access.";
  }
  if (/ENOENT|no such file|could not find/i.test(error.message)) {
    return "The file is no longer at its original location.";
  }
  if (/EACCES|EPERM|permission denied|access is denied/i.test(error.message)) {
    return "The operating system denied access to this file. Check its permissions and try again.";
  }
  if (/MB|clipboard|not a file|Choose a Markdown file|UTF-8/i.test(error.message)) {
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

function showError(error: unknown, attemptedPath: string | null = null): void {
  loadingState.hidden = true;
  emptyState.hidden = true;
  article.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = describeError(error);
  statusMessage.textContent = "Open failed";
  notifyRendered(attemptedPath);
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

function notifyRendered(documentPath: string | null = currentDocument?.path ?? null): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.mdViewer.notifyDocumentRendered(documentPath));
  });
}

function textOffsetAt(node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(article);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function captureSelection(): SelectionSnapshot | null {
  const selection = window.getSelection();
  if (selection === null) {
    return null;
  }
  const range = selectionInsideArticle(selection);
  if (range === null) {
    return null;
  }
  return {
    start: textOffsetAt(range.startContainer, range.startOffset),
    end: textOffsetAt(range.endContainer, range.endOffset),
    text: range.toString(),
  };
}

function captureReadingState(): ReadingSnapshot {
  const readerRect = reader.getBoundingClientRect();
  const headings = Array.from(article.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6"))
    .filter((heading) => heading.closest(".document-metadata") === null);
  const currentHeading = headings.reduce<HTMLHeadingElement | null>((closest, heading) => {
    const top = heading.getBoundingClientRect().top - readerRect.top;
    return top <= 56 ? heading : closest;
  }, null);
  const maximum = reader.scrollHeight - reader.clientHeight;
  return {
    activeSearchIndex,
    headingId: currentHeading?.id ?? null,
    headingOffset: currentHeading === null ? 0 : currentHeading.getBoundingClientRect().top - readerRect.top,
    scrollRatio: maximum <= 0 ? 0 : reader.scrollTop / maximum,
    searchQuery: searchInput.value,
    selection: captureSelection(),
  };
}

function pointAtTextOffset(offset: number): { readonly node: Text; readonly offset: number } | null {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node !== null) {
    if (node instanceof Text) {
      const length = node.data.length;
      if (remaining <= length) {
        return { node, offset: remaining };
      }
      remaining -= length;
    }
    node = walker.nextNode();
  }
  return null;
}

function restoreSelection(snapshot: SelectionSnapshot | null): void {
  if (snapshot === null || snapshot.text === "") {
    return;
  }
  const start = pointAtTextOffset(snapshot.start);
  const end = pointAtTextOffset(snapshot.end);
  if (start === null || end === null) {
    return;
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  if (range.toString() !== snapshot.text) {
    return;
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function restoreReadingState(snapshot: ReadingSnapshot): void {
  searchInput.value = snapshot.searchQuery;
  if (snapshot.searchQuery.trim() !== "") {
    runSearch(snapshot.activeSearchIndex, false);
  }

  window.requestAnimationFrame(() => {
    const heading = snapshot.headingId === null ? null : document.getElementById(snapshot.headingId);
    if (heading !== null && article.contains(heading)) {
      const readerTop = reader.getBoundingClientRect().top;
      reader.scrollTop += heading.getBoundingClientRect().top - readerTop - snapshot.headingOffset;
    } else {
      const maximum = reader.scrollHeight - reader.clientHeight;
      reader.scrollTop = Math.max(0, maximum * snapshot.scrollRatio);
    }
    restoreSelection(snapshot.selection);
    updateReadingProgress();
  });
}

function persistedState(snapshot: ReadingSnapshot): PersistedReadingState {
  return {
    headingId: snapshot.headingId,
    headingOffset: snapshot.headingOffset,
    scrollRatio: snapshot.scrollRatio,
  };
}

function snapshotFromPersisted(state: PersistedReadingState | null): ReadingSnapshot | null {
  if (state === null) return null;
  return {
    activeSearchIndex: -1,
    headingId: state.headingId,
    headingOffset: state.headingOffset,
    scrollRatio: state.scrollRatio,
    searchQuery: "",
    selection: null,
  };
}

function saveCurrentReadingState(immediate = false): void {
  if (readingStateSaveTimer !== null) {
    window.clearTimeout(readingStateSaveTimer);
    readingStateSaveTimer = null;
  }
  const documentPath = currentDocument?.path;
  if (documentPath === undefined || documentPath === "") return;
  const save = (): void => {
    if (currentDocument?.path !== documentPath) return;
    const snapshot = captureReadingState();
    navigationHistory.saveCurrentState(snapshot);
    void window.mdViewer.setReadingState(documentPath, persistedState(snapshot)).catch(() => undefined);
  };
  if (immediate) save();
  else readingStateSaveTimer = window.setTimeout(save, 350);
}

function updateNavigationControls(): void {
  backButton.disabled = !navigationHistory.canGoBack;
  forwardButton.disabled = !navigationHistory.canGoForward;
}

function beginDocumentNavigation(): void {
  if (currentDocument !== null) {
    const snapshot = captureReadingState();
    navigationHistory.saveCurrentState(snapshot);
    saveCurrentReadingState(true);
  }
  showLoading();
}

function scrollToFragment(fragment: string | null): void {
  if (fragment === null || fragment === "") return;
  const encodedId = fragment.replace(/^#/, "");
  let id = encodedId;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    // Keep the literal fragment when a document contains an invalid percent escape.
  }
  window.requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target !== null && article.contains(target)) {
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    } else {
      showToast(`Heading “${id}” was not found in this document.`);
    }
  });
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
    heading.tabIndex = -1;

    const permalink = document.createElement("a");
    permalink.className = "heading-permalink";
    permalink.dataset.chweziUi = "true";
    permalink.href = `#${encodeURIComponent(id)}`;
    permalink.textContent = "¶";
    permalink.setAttribute("aria-label", `Link to ${text}`);
    permalink.title = "Link to this heading";
    heading.append(permalink);

    const link = document.createElement("button");
    link.type = "button";
    link.className = `contents-link level-${heading.tagName.slice(1)}`;
    link.dataset.targetId = id;
    link.textContent = text;
    link.title = text;
    link.addEventListener("click", () => heading.scrollIntoView({ behavior: "smooth", block: "start" }));
    contentsList.append(link);
  }

  contentsEmpty.hidden = contentsList.childElementCount > 0;
  contentsFilter.value = "";
}

function filterContents(): void {
  const query = contentsFilter.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const link of contentsList.querySelectorAll<HTMLButtonElement>(".contents-link")) {
    const matches = query === "" || (link.textContent ?? "").toLocaleLowerCase().includes(query);
    link.hidden = !matches;
    if (matches) visible += 1;
  }
  contentsEmpty.hidden = visible > 0;
  contentsEmpty.textContent = contentsList.childElementCount === 0
    ? "Headings will appear here."
    : "No headings match this filter.";
}

function enhanceRenderedContent(): void {
  buildContents();
  enhanceCodeBlocks(article, async (code) => {
    await window.mdViewer.copyText(code);
    showToast("Code copied");
  });

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
      if (isRelativeMarkdownHref(rawHref)) {
        void openRelativeDocument(rawHref);
      } else {
        void window.mdViewer.openExternal(anchor.href).catch((error: unknown) => showToast(describeError(error)));
      }
    });
  }

  for (const image of article.querySelectorAll<HTMLImageElement>("img")) {
    if (image.dataset.chweziRemoteSrc !== undefined) {
      image.classList.add("remote-image-blocked");
      image.title = "Remote image blocked to protect your privacy";
      image.alt = image.alt === "" ? "Remote image blocked" : `${image.alt} (remote image blocked)`;
    }
    image.addEventListener("error", () => {
      image.classList.add("image-error");
      image.alt = image.alt === "" ? "Image could not be loaded" : `${image.alt} (could not be loaded)`;
    });
  }
}

function prependFrontMatter(fields: readonly { readonly name: string; readonly value: string }[]): void {
  if (fields.length === 0) return;
  const metadata = document.createElement("section");
  metadata.className = "document-metadata";
  metadata.setAttribute("aria-labelledby", "document-metadata-heading");
  const heading = document.createElement("h2");
  heading.id = "document-metadata-heading";
  const icon = document.createElement("span");
  icon.className = "mask-icon icon-braces";
  icon.setAttribute("aria-hidden", "true");
  heading.append(icon, "Document details");
  const list = document.createElement("dl");
  for (const field of fields) {
    const term = document.createElement("dt");
    term.textContent = field.name;
    const description = document.createElement("dd");
    description.textContent = field.value;
    list.append(term, description);
  }
  metadata.append(heading, list);
  article.prepend(metadata);
}

function updateRemoteImageBanner(count: number, imagesAllowed: boolean): void {
  remoteImageBanner.hidden = count === 0;
  if (count === 0) {
    return;
  }
  const imageLabel = `${count.toLocaleString()} remote image${count === 1 ? "" : "s"}`;
  remoteImageTitle.textContent = imagesAllowed ? `${imageLabel} allowed` : `${imageLabel} blocked`;
  remoteImageMessage.textContent = imagesAllowed
    ? "Loading remote images can reveal your IP address to their hosts."
    : "No network request was made for these images.";
  remoteImagesOnce.hidden = imagesAllowed;
  remoteImagesAlways.hidden = imagesAllowed || remoteImagePolicy === "allow";
  remoteImagesBlock.hidden = !imagesAllowed;
}

function displayDocument(
  payload: DocumentPayload,
  options: {
    readonly reloaded?: boolean;
    readonly snapshot?: ReadingSnapshot | null;
    readonly privacyChanged?: boolean;
    readonly recordHistory?: boolean;
    readonly fragment?: string | null;
  } = {},
): void {
  const sameDocument = currentDocument?.path !== "" && currentDocument?.path === payload.path;
  if (options.recordHistory === true) {
    navigationHistory.push(payload, options.fragment ?? null);
    updateNavigationControls();
  }
  if (!sameDocument) {
    allowRemoteImagesForCurrentDocument = false;
  }
  const imagesAllowed = remoteImagePolicy === "allow" || allowRemoteImagesForCurrentDocument;
  const rendered = renderMarkdown(payload.content, { remoteImages: imagesAllowed ? "allow" : "block" });
  currentDocument = payload;
  documentBase.href = payload.path === "" ? "./" : new URL(".", payload.fileUrl).toString();
  article.innerHTML = rendered.html; // HTML is sanitized by DOMPurify in renderMarkdown.
  prependFrontMatter(rendered.frontMatter);
  enhanceRenderedContent();
  updateRemoteImageBanner(rendered.remoteImageCount, imagesAllowed);

  loadingState.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  article.hidden = false;
  copyButton.disabled = false;
  printButton.disabled = false;
  revealButton.disabled = payload.path === "";
  editorButton.disabled = payload.path === "";
  exportHtmlButton.disabled = payload.path === "";
  exportPdfButton.disabled = payload.path === "";
  documentName.textContent = payload.name;
  const modified = new Date(payload.modifiedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  documentMeta.textContent = `${formatBytes(payload.size)} · ${rendered.wordCount.toLocaleString()} words · ${rendered.readingMinutes} min read`;
  statusMessage.textContent = `Modified ${modified}`;
  window.mdViewer.setTitle(`${payload.name} — Chwezi Markdown Reader`);
  clearSearch(false);
  if (options.snapshot !== null && options.snapshot !== undefined) {
    restoreReadingState(options.snapshot);
  } else {
    searchInput.value = "";
    reader.scrollTop = 0;
    updateReadingProgress();
  }
  if (options.fragment !== null && options.fragment !== undefined) {
    scrollToFragment(options.fragment);
  }

  if (options.reloaded === true) {
    showToast("Updated from disk");
  } else if (options.privacyChanged === true) {
    showToast(imagesAllowed ? "Remote images allowed for this document" : "Remote images blocked");
  }
  notifyRendered(payload.path);
}

async function storedSnapshot(filePath: string): Promise<ReadingSnapshot | null> {
  if (filePath === "") return null;
  try {
    return snapshotFromPersisted(await window.mdViewer.getReadingState(filePath));
  } catch {
    return null;
  }
}

async function displayNewDocument(payload: DocumentPayload, fragment: string | null = null): Promise<void> {
  const snapshot = fragment === null ? await storedSnapshot(payload.path) : null;
  displayDocument(payload, { snapshot, recordHistory: true, fragment });
}

async function openFile(): Promise<void> {
  try {
    const payload = await window.mdViewer.openFile();
    if (payload !== null) {
      beginDocumentNavigation();
      await displayNewDocument(payload);
    }
  } catch (error: unknown) {
    showError(error);
  }
}

async function openPath(filePath: string, reloaded = false, suppliedSnapshot: ReadingSnapshot | null = null): Promise<void> {
  const snapshot = suppliedSnapshot ?? (reloaded && currentDocument?.path === filePath ? captureReadingState() : null);
  if (reloaded) showLoading();
  else beginDocumentNavigation();
  try {
    const payload = await window.mdViewer.readFile(filePath);
    if (reloaded) displayDocument(payload, { reloaded, snapshot });
    else await displayNewDocument(payload);
  } catch (error: unknown) {
    showError(error, filePath);
  }
}

function enqueueOpenPath(filePath: string, reloaded = false, snapshot: ReadingSnapshot | null = null): void {
  queuedOpen = queuedOpen.then(async () => {
    if (reloaded && currentDocument?.path !== filePath) {
      return;
    }
    await openPath(filePath, reloaded, snapshot);
  });
}

async function openRelativeDocument(href: string): Promise<void> {
  if (currentDocument === null || currentDocument.path === "") return;
  const sourcePath = currentDocument.path;
  beginDocumentNavigation();
  try {
    const result = await window.mdViewer.openRelativeMarkdown(href, sourcePath);
    await displayNewDocument(result.document, result.fragment);
  } catch (error: unknown) {
    showError(error, sourcePath);
  }
}

async function navigateDocumentHistory(direction: "back" | "forward"): Promise<void> {
  saveCurrentReadingState(true);
  const entry: DocumentHistoryEntry | null = direction === "back" ? navigationHistory.back() : navigationHistory.forward();
  if (entry === null) return;
  updateNavigationControls();
  showLoading();
  try {
    const payload = await window.mdViewer.readFile(entry.document.path);
    displayDocument(payload, {
      snapshot: entry.state,
      fragment: entry.state === null ? entry.fragment : null,
    });
  } catch (error: unknown) {
    if (direction === "back") navigationHistory.undoBack();
    else navigationHistory.undoForward();
    updateNavigationControls();
    showError(error, entry.document.path);
  }
}

async function openRecentDocument(filePath: string): Promise<void> {
  recentDialog.close();
  beginDocumentNavigation();
  try {
    await displayNewDocument(await window.mdViewer.openRecentFile(filePath));
  } catch (error: unknown) {
    showError(error, filePath);
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
    clone.querySelectorAll("[data-chwezi-ui]").forEach((element) => element.remove());
    clone.style.margin = "0";
    clone.style.boxShadow = "none";
    wrapper.append(...clone.childNodes);
    return { html: wrapper.outerHTML, text: renderedPlainText() };
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

function renderedPlainText(): string {
  const excluded = Array.from(article.querySelectorAll<HTMLElement>("[data-chwezi-ui]"));
  const previousHidden = excluded.map((element) => element.hidden);
  excluded.forEach((element) => { element.hidden = true; });
  try {
    return article.innerText;
  } finally {
    excluded.forEach((element, index) => { element.hidden = previousHidden[index] ?? false; });
  }
}

async function copyRenderedDocument(): Promise<void> {
  if (currentDocument === null) {
    return;
  }
  try {
    const content = createClipboardContent(null);
    const limits = await window.mdViewer.getLimits();
    const encoder = new TextEncoder();
    const htmlBytes = encoder.encode(content.html).byteLength;
    const textBytes = encoder.encode(content.text).byteLength;
    if (textBytes > limits.maxClipboardTextBytes) {
      showToast(`Rendered text is ${formatBytes(textBytes)} and exceeds the ${formatBytes(limits.maxClipboardTextBytes)} clipboard limit.`);
      return;
    }
    if (htmlBytes > limits.maxClipboardHtmlBytes) {
      await window.mdViewer.copyText(content.text);
      window.mdViewer.notifyClipboardWritten();
      showToast(`Rich copy is ${formatBytes(htmlBytes)}; rendered text was copied instead.`);
      return;
    }
    await window.mdViewer.copyRich(content.html, content.text);
    window.mdViewer.notifyClipboardWritten();
    showToast("Rendered document copied");
  } catch (error: unknown) {
    showToast(`Copy failed: ${describeError(error)}`);
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

function searchHighlightRegistry(): { delete(name: string): boolean; set(name: string, highlight: Highlight): void } | null {
  const cssWithHighlights = CSS as typeof CSS & {
    highlights?: { delete(name: string): boolean; set(name: string, highlight: Highlight): void };
  };
  return cssWithHighlights.highlights ?? null;
}

function clearSearch(resetCount = true): void {
  for (const match of searchMatches) {
    const mark = match.fallbackMark;
    if (mark !== null && mark.isConnected) {
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent?.normalize();
    }
  }
  searchMatches = [];
  activeSearchIndex = -1;
  const registry = searchHighlightRegistry();
  registry?.delete("search-results");
  registry?.delete("search-active");
  if (resetCount) {
    searchCount.textContent = "0 results";
  }
}

function renderSearchHighlights(): void {
  const registry = searchHighlightRegistry();
  if (registry !== null && typeof Highlight !== "undefined") {
    const activeRange = searchMatches[activeSearchIndex]?.range;
    const otherRanges = searchMatches
      .filter((_match, index) => index !== activeSearchIndex)
      .map((match) => match.range);
    registry.delete("search-results");
    registry.delete("search-active");
    if (otherRanges.length > 0) {
      registry.set("search-results", new Highlight(...otherRanges));
    }
    if (activeRange !== undefined) {
      registry.set("search-active", new Highlight(activeRange));
    }
    return;
  }
  searchMatches.forEach((match, index) => {
    match.fallbackMark?.classList.toggle("active", index === activeSearchIndex);
  });
}

function installFallbackSearchMarks(): void {
  for (let index = searchMatches.length - 1; index >= 0; index -= 1) {
    const match = searchMatches[index];
    if (match === undefined) {
      continue;
    }
    const mark = document.createElement("mark");
    mark.className = "search-fallback";
    try {
      match.range.surroundContents(mark);
      match.fallbackMark = mark;
    } catch {
      // Each match is inside one text node, but a detached node can race a reload.
    }
  }
}

function runSearch(preferredIndex = 0, scrollActive = true): void {
  clearSearch();
  const query = searchInput.value.trim();
  if (query === "" || currentDocument === null) {
    return;
  }

  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node): number {
      const parent = node.parentElement;
      return parent?.closest("[data-chwezi-ui]") === null ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node !== null) {
    const text = node.textContent ?? "";
    for (const match of findTextMatches(text, query, {
      matchCase: searchMatchCase.checked,
      wholeWord: searchWholeWord.checked,
    })) {
      const range = document.createRange();
      range.setStart(node, match.start);
      range.setEnd(node, match.end);
      searchMatches.push({ range, fallbackMark: null });
    }
    node = walker.nextNode();
  }

  if (searchMatches.length > 0) {
    activeSearchIndex = Math.min(Math.max(0, preferredIndex), searchMatches.length - 1);
    if (searchHighlightRegistry() === null || typeof Highlight === "undefined") {
      installFallbackSearchMarks();
    }
    renderSearchHighlights();
    if (scrollActive) {
      scrollToSearchResult();
    }
  }
  updateSearchCount();
}

function updateSearchCount(): void {
  searchCount.textContent = searchMatches.length === 0
    ? "0 results"
    : `${activeSearchIndex + 1} of ${searchMatches.length}`;
}

function scrollToSearchResult(): void {
  const match = searchMatches[activeSearchIndex];
  if (match === undefined) {
    return;
  }
  const element = match.fallbackMark ?? match.range.startContainer.parentElement;
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function stepSearch(direction: 1 | -1): void {
  if (searchMatches.length === 0) {
    return;
  }
  activeSearchIndex = (activeSearchIndex + direction + searchMatches.length) % searchMatches.length;
  renderSearchHighlights();
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
  backToTop.hidden = reader.scrollTop < 640;
  const readerTop = reader.getBoundingClientRect().top;
  let activeId: string | null = null;
  for (const heading of Array.from(article.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6")).filter((candidate) => candidate.closest(".document-metadata") === null)) {
    if (heading.getBoundingClientRect().top - readerTop <= 72) {
      activeId = heading.id;
    } else {
      break;
    }
  }
  for (const link of contentsList.querySelectorAll<HTMLButtonElement>(".contents-link")) {
    const active = activeId !== null && link.dataset.targetId === activeId;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  }
  saveCurrentReadingState();
}

async function openDroppedFile(file: File): Promise<void> {
  if (!isMarkdownFilename(file.name)) {
    showToast("Drop a Markdown file: .md, .markdown, .mdown, or .mkd");
    return;
  }
  beginDocumentNavigation();
  try {
    await displayNewDocument(await window.mdViewer.openDroppedFile(file));
  } catch (error: unknown) {
    showError(error);
  }
}

function rerenderForImagePolicy(): void {
  if (currentDocument === null) {
    return;
  }
  const snapshot = captureReadingState();
  displayDocument(currentDocument, { snapshot, privacyChanged: true });
}

async function loadRemoteImagesOnce(): Promise<void> {
  allowRemoteImagesForCurrentDocument = true;
  rerenderForImagePolicy();
}

async function setRemoteImagesGlobally(policy: RemoteImagePolicy): Promise<void> {
  remoteImagePolicy = policy;
  allowRemoteImagesForCurrentDocument = false;
  localStorage.setItem("remote-image-policy", policy);
  try {
    await window.mdViewer.setRemoteImagePolicy(policy);
  } catch (error: unknown) {
    showToast(`Privacy setting could not be saved: ${describeError(error)}`);
  }
  rerenderForImagePolicy();
}

function updateFullscreenControl(fullscreen: boolean): void {
  isFullscreen = fullscreen;
  const action = fullscreen ? "Exit full screen" : "Enter full screen";
  fullscreenButton.setAttribute("aria-label", action);
  fullscreenButton.title = fullscreen ? `${action} (Esc)` : action;
  fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
  appShell.classList.toggle("is-fullscreen", fullscreen);
}

async function toggleFullscreen(): Promise<void> {
  try {
    updateFullscreenControl(await window.mdViewer.toggleFullscreen());
  } catch (error: unknown) {
    showToast(describeError(error));
  }
}

async function showAbout(): Promise<void> {
  if (aboutDialog.open) {
    return;
  }
  try {
    const info = await window.mdViewer.getAppInfo();
    aboutVersion.textContent = `Version ${info.version}`;
  } catch {
    aboutVersion.textContent = "Version unavailable";
  }
  aboutDialog.showModal();
  aboutDone.focus();
}

function closeAbout(): void {
  aboutDialog.close();
  aboutButton.focus();
}

async function copyContact(value: string): Promise<void> {
  try {
    await window.mdViewer.copyText(value);
    showToast("Contact detail copied");
  } catch (error: unknown) {
    showToast(`Copy failed: ${describeError(error)}`);
  }
}

function syncAppearanceControls(): void {
  readerFont.value = readerSettings.fontFamily;
  fontSize.value = String(readerSettings.fontSize);
  lineHeight.value = String(readerSettings.lineHeight);
  readingWidth.value = String(readerSettings.readingWidth);
  paragraphSpacing.value = String(readerSettings.paragraphSpacing);
  fontSizeValue.value = `${readerSettings.fontSize} px`;
  lineHeightValue.value = readerSettings.lineHeight.toFixed(2);
  readingWidthValue.value = `${readerSettings.readingWidth} px`;
  paragraphSpacingValue.value = readerSettings.paragraphSpacing.toFixed(2);
  reopenLast.checked = readerSettings.reopenLastDocument;
}

function settingsFromControls(): ReaderSettings {
  return normaliseReaderSettings({
    fontFamily: readerFont.value as ReaderFont,
    fontSize: Number(fontSize.value),
    lineHeight: Number(lineHeight.value),
    readingWidth: Number(readingWidth.value),
    paragraphSpacing: Number(paragraphSpacing.value),
    reopenLastDocument: reopenLast.checked,
  });
}

function scheduleSettingsSave(): void {
  readerSettings = settingsFromControls();
  applyReaderSettings(article, readerSettings);
  syncAppearanceControls();
  if (settingsSaveTimer !== null) window.clearTimeout(settingsSaveTimer);
  settingsSaveTimer = window.setTimeout(() => {
    settingsSaveTimer = null;
    void window.mdViewer.updateSettings(readerSettings).then((saved) => {
      readerSettings = normaliseReaderSettings(saved);
      applyReaderSettings(article, readerSettings);
      syncAppearanceControls();
    }).catch((error: unknown) => showToast(`Settings could not be saved: ${describeError(error)}`));
  }, 180);
}

function showAppearance(): void {
  if (appearanceDialog.open) return;
  syncAppearanceControls();
  appearanceDialog.showModal();
  readerFont.focus();
}

function closeAppearance(): void {
  appearanceDialog.close();
  appearanceButton.focus();
}

function renderRecentFiles(files: readonly RecentFile[]): void {
  recentList.replaceChildren();
  for (const file of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-item";
    button.title = file.path;
    const name = document.createElement("strong");
    name.textContent = file.name;
    const location = document.createElement("span");
    location.textContent = file.path;
    const opened = document.createElement("time");
    opened.dateTime = new Date(file.lastOpenedAt).toISOString();
    opened.textContent = new Date(file.lastOpenedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    button.append(name, location, opened);
    button.addEventListener("click", () => void openRecentDocument(file.path));
    recentList.append(button);
  }
  recentEmpty.hidden = files.length > 0;
  recentClear.disabled = files.length === 0;
}

async function showRecentFiles(): Promise<void> {
  if (recentDialog.open) return;
  recentDialog.showModal();
  recentList.setAttribute("aria-busy", "true");
  try {
    renderRecentFiles(await window.mdViewer.getRecentFiles());
  } catch (error: unknown) {
    showToast(describeError(error));
  } finally {
    recentList.removeAttribute("aria-busy");
  }
}

function closeRecentFiles(): void {
  recentDialog.close();
  recentButton.focus();
}

function setNavigatorView(view: "outline" | "library", moveFocus = false): void {
  const showLibrary = view === "library";
  outlineTab.setAttribute("aria-selected", String(!showLibrary));
  libraryTab.setAttribute("aria-selected", String(showLibrary));
  outlineTab.tabIndex = showLibrary ? -1 : 0;
  libraryTab.tabIndex = showLibrary ? 0 : -1;
  outlinePanel.hidden = showLibrary;
  libraryPanel.hidden = !showLibrary;
  if (moveFocus) (showLibrary ? libraryTab : outlineTab).focus();
}

function setFolderSearchIdle(): void {
  activeFolderSearchId = null;
  librarySearch.removeAttribute("aria-busy");
  librarySearchCancel.hidden = true;
}

function displayFolderFiles(): void {
  libraryFiles.hidden = false;
  libraryResults.hidden = true;
}

function relativePathMatchesDocument(relativePath: string, documentPath: string): boolean {
  const normalisedRelative = relativePath.replaceAll("\\", "/").toLocaleLowerCase();
  const normalisedDocument = documentPath.replaceAll("\\", "/").toLocaleLowerCase();
  return normalisedDocument.endsWith(`/${normalisedRelative}`);
}

function createFolderEntryElement(entry: FolderEntry): HTMLElement {
  if (entry.kind === "folder") {
    const folder = document.createElement("div");
    folder.className = "library-folder";
    folder.setAttribute("aria-label", `Folder: ${entry.relativePath}`);
    folder.style.paddingLeft = `${7 + (entry.depth * 12)}px`;
    const icon = document.createElement("span");
    icon.className = "mask-icon icon-list-tree";
    icon.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = entry.name;
    folder.append(icon, name);
    return folder;
  }
    const file = document.createElement("button");
    file.type = "button";
    file.className = "library-file";
    file.setAttribute("aria-label", `Open ${entry.relativePath}`);
    file.style.paddingLeft = `${7 + (entry.depth * 12)}px`;
    file.title = entry.relativePath;
    const name = document.createElement("span");
    name.textContent = entry.name;
    file.append(name);
    const isActive = currentDocument !== null && relativePathMatchesDocument(entry.relativePath, currentDocument.path);
    file.classList.toggle("active", isActive);
    if (isActive) file.setAttribute("aria-current", "page");
    file.addEventListener("click", () => void openFolderDocument(entry.relativePath));
    return file;
}

function renderFolder(snapshot: FolderSnapshot): void {
  currentFolder = snapshot;
  const generation = ++folderRenderGeneration;
  libraryName.textContent = snapshot.name;
  libraryName.title = snapshot.name;
  librarySearchInput.disabled = false;
  libraryRefresh.disabled = false;
  libraryClose.disabled = false;
  libraryFiles.replaceChildren();
  const appendBatch = (start: number): void => {
    if (generation !== folderRenderGeneration) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(snapshot.entries.length, start + 250);
    for (let index = start; index < end; index += 1) {
      const entry = snapshot.entries[index];
      if (entry !== undefined) fragment.append(createFolderEntryElement(entry));
    }
    libraryFiles.append(fragment);
    if (end < snapshot.entries.length) {
      libraryStatus.textContent = `Loading folder: ${end.toLocaleString()} of ${snapshot.entries.length.toLocaleString()} entries...`;
      window.requestAnimationFrame(() => appendBatch(end));
    } else {
      libraryStatus.textContent = `${snapshot.documentCount.toLocaleString()} Markdown document${snapshot.documentCount === 1 ? "" : "s"}${snapshot.truncated ? " (folder list limited)" : ""}.`;
    }
  }
  appendBatch(0);
  libraryResults.replaceChildren();
  displayFolderFiles();
}

function clearFolder(): void {
  folderRenderGeneration += 1;
  currentFolder = null;
  folderSearchQuery = "";
  libraryName.textContent = "No folder open";
  libraryName.removeAttribute("title");
  librarySearchInput.value = "";
  librarySearchInput.disabled = true;
  libraryRefresh.disabled = true;
  libraryClose.disabled = true;
  libraryFiles.replaceChildren();
  libraryResults.replaceChildren();
  displayFolderFiles();
  setFolderSearchIdle();
  libraryStatus.textContent = "Choose a folder to browse its Markdown files.";
}

async function chooseFolder(): Promise<void> {
  try {
    if (activeFolderSearchId !== null) await cancelFolderSearch();
    const snapshot = await window.mdViewer.openFolder();
    if (snapshot === null) return;
    renderFolder(snapshot);
    setNavigatorView("library");
    appShell.classList.remove("contents-collapsed");
    librarySearchInput.focus();
  } catch (error: unknown) {
    showToast(`Folder could not be opened: ${describeError(error)}`);
  }
}

async function refreshFolder(): Promise<void> {
  if (currentFolder === null) return;
  if (activeFolderSearchId !== null) await cancelFolderSearch();
  libraryRefresh.disabled = true;
  try {
    renderFolder(await window.mdViewer.refreshFolder(currentFolder.id));
  } catch (error: unknown) {
    showToast(`Folder could not be refreshed: ${describeError(error)}`);
  } finally {
    libraryRefresh.disabled = currentFolder === null;
  }
}

async function closeFolder(): Promise<void> {
  if (currentFolder === null) return;
  const folderId = currentFolder.id;
  if (activeFolderSearchId !== null) await cancelFolderSearch();
  try {
    await window.mdViewer.closeFolder(folderId);
    clearFolder();
    setNavigatorView("outline");
  } catch (error: unknown) {
    showToast(`Folder could not be closed: ${describeError(error)}`);
  }
}

async function openFolderDocument(relativePath: string, searchResultIndex: number | null = null): Promise<void> {
  if (currentFolder === null) return;
  beginDocumentNavigation();
  try {
    await displayNewDocument(await window.mdViewer.openFolderFile(currentFolder.id, relativePath));
    renderFolder(currentFolder);
    if (searchResultIndex !== null && folderSearchQuery !== "") {
      searchInput.value = folderSearchQuery;
      searchMatchCase.checked = folderSearchOptions.matchCase;
      searchWholeWord.checked = folderSearchOptions.wholeWord;
      showSearch();
      runSearch(searchResultIndex);
    }
  } catch (error: unknown) {
    showError(error);
  }
}

function renderFolderSearchResults(response: FolderSearchResponse): void {
  libraryResults.replaceChildren();
  response.results.forEach((result, resultIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-result";
    button.title = `${result.relativePath}:${result.line}:${result.column}`;
    const name = document.createElement("strong");
    name.textContent = `${result.name} - line ${result.line.toLocaleString()}`;
    const snippet = document.createElement("span");
    snippet.textContent = result.snippet;
    button.append(name, snippet);
    const occurrence = response.results.slice(0, resultIndex).filter((candidate) => candidate.relativePath === result.relativePath).length;
    button.addEventListener("click", () => void openFolderDocument(result.relativePath, occurrence));
    libraryResults.append(button);
  });
  libraryFiles.hidden = true;
  libraryResults.hidden = false;
  const suffix = [
    response.truncated ? "results limited" : "",
    response.skippedFiles > 0 ? `${response.skippedFiles.toLocaleString()} skipped` : "",
  ].filter((value) => value !== "").join(", ");
  libraryStatus.textContent = response.results.length === 0
    ? `No matches in ${response.scannedFiles.toLocaleString()} document${response.scannedFiles === 1 ? "" : "s"}.`
    : `${response.results.length.toLocaleString()} match${response.results.length === 1 ? "" : "es"} in ${response.scannedFiles.toLocaleString()} scanned${suffix === "" ? "" : `; ${suffix}`}.`;
}

async function searchFolder(): Promise<void> {
  if (currentFolder === null) return;
  const query = librarySearchInput.value.trim();
  if (query === "") {
    folderSearchQuery = "";
    displayFolderFiles();
    libraryStatus.textContent = `${currentFolder.documentCount.toLocaleString()} Markdown document${currentFolder.documentCount === 1 ? "" : "s"}.`;
    return;
  }
  if (activeFolderSearchId !== null) await cancelFolderSearch();
  const requestId = crypto.randomUUID();
  activeFolderSearchId = requestId;
  folderSearchQuery = query;
  folderSearchOptions = { matchCase: libraryMatchCase.checked, wholeWord: libraryWholeWord.checked };
  librarySearch.setAttribute("aria-busy", "true");
  librarySearchCancel.hidden = false;
  libraryStatus.textContent = `Searching for "${query}"...`;
  try {
    const response = await window.mdViewer.searchFolder({
      requestId,
      folderId: currentFolder.id,
      query,
      matchCase: folderSearchOptions.matchCase,
      wholeWord: folderSearchOptions.wholeWord,
    });
    if (activeFolderSearchId !== requestId || response.requestId !== requestId) return;
    if (response.cancelled) {
      displayFolderFiles();
      libraryStatus.textContent = "Folder search cancelled.";
    } else {
      renderFolderSearchResults(response);
    }
  } catch (error: unknown) {
    if (activeFolderSearchId === requestId) {
      displayFolderFiles();
      libraryStatus.textContent = "Folder search failed.";
      showToast(describeError(error));
    }
  } finally {
    if (activeFolderSearchId === requestId) setFolderSearchIdle();
  }
}

async function cancelFolderSearch(): Promise<void> {
  const requestId = activeFolderSearchId;
  if (requestId === null) return;
  setFolderSearchIdle();
  displayFolderFiles();
  libraryStatus.textContent = "Folder search cancelled.";
  try {
    await window.mdViewer.cancelFolderSearch(requestId);
  } catch (error: unknown) {
    showToast(`Search cancellation failed: ${describeError(error)}`);
  }
}

async function exportStandaloneHtml(): Promise<void> {
  if (currentDocument === null || currentDocument.path === "") return;
  documentActions.open = false;
  exportHtmlButton.disabled = true;
  statusMessage.textContent = "Preparing standalone HTML...";
  try {
    const payload = createStandaloneHtmlPayload(article);
    const saved = await window.mdViewer.exportHtml({
      documentPath: currentDocument.path,
      title: currentDocument.name,
      bodyHtml: payload.bodyHtml,
      css: payload.css,
      resources: payload.resources,
    });
    showToast(saved ? "Standalone HTML exported" : "HTML export cancelled");
  } catch (error: unknown) {
    showToast(`HTML export failed: ${describeError(error)}`);
  } finally {
    exportHtmlButton.disabled = currentDocument === null || currentDocument.path === "";
    if (currentDocument !== null) statusMessage.textContent = `Modified ${new Date(currentDocument.modifiedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }
}

async function exportPdf(): Promise<void> {
  if (currentDocument === null || currentDocument.path === "") return;
  documentActions.open = false;
  exportPdfButton.disabled = true;
  const suggestedName = currentDocument.name.replace(/\.(?:md|markdown|mdown|mkd)$/iu, "") + ".pdf";
  try {
    const saved = await window.mdViewer.exportPdf(currentDocument.path, suggestedName);
    showToast(saved ? "PDF exported" : "PDF export cancelled");
  } catch (error: unknown) {
    showToast(`PDF export failed: ${describeError(error)}`);
  } finally {
    exportPdfButton.disabled = currentDocument === null || currentDocument.path === "";
  }
}

async function revealCurrentFile(): Promise<void> {
  if (currentDocument?.path === undefined || currentDocument.path === "") return;
  try {
    if (!await window.mdViewer.revealFile(currentDocument.path)) showToast("The file could not be revealed in its folder.");
  } catch (error: unknown) {
    showToast(describeError(error));
  }
}

async function openCurrentFileInEditor(): Promise<void> {
  if (currentDocument?.path === undefined || currentDocument.path === "") return;
  try {
    if (!await window.mdViewer.openInExternalEditor(currentDocument.path)) showToast("No external editor accepted this file.");
  } catch (error: unknown) {
    showToast(describeError(error));
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
    case "back": void navigateDocumentHistory("back"); break;
    case "forward": void navigateDocumentHistory("forward"); break;
    case "reveal": void revealCurrentFile(); break;
    case "open-editor": void openCurrentFileInEditor(); break;
    case "open-folder": void chooseFolder(); break;
    case "export-html": void exportStandaloneHtml(); break;
    case "export-pdf": void exportPdf(); break;
  }
}

openButton.addEventListener("click", () => void openFile());
openFolderButton.addEventListener("click", () => void chooseFolder());
emptyOpenButton.addEventListener("click", () => void openFile());
errorOpenButton.addEventListener("click", () => void openFile());
copyButton.addEventListener("click", () => void copyRenderedDocument());
printButton.addEventListener("click", () => void printDocument());
themeButton.addEventListener("click", toggleTheme);
fullscreenButton.addEventListener("click", () => void toggleFullscreen());
aboutButton.addEventListener("click", () => void showAbout());
appearanceButton.addEventListener("click", showAppearance);
backButton.addEventListener("click", () => void navigateDocumentHistory("back"));
forwardButton.addEventListener("click", () => void navigateDocumentHistory("forward"));
recentButton.addEventListener("click", () => void showRecentFiles());
revealButton.addEventListener("click", () => void revealCurrentFile());
editorButton.addEventListener("click", () => void openCurrentFileInEditor());
exportHtmlButton.addEventListener("click", () => void exportStandaloneHtml());
exportPdfButton.addEventListener("click", () => void exportPdf());
contentsButton.addEventListener("click", toggleContents);
outlineTab.addEventListener("click", () => setNavigatorView("outline"));
libraryTab.addEventListener("click", () => setNavigatorView("library"));
for (const tab of [outlineTab, libraryTab]) {
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setNavigatorView(tab === outlineTab ? "library" : "outline", true);
  });
}
libraryChoose.addEventListener("click", () => void chooseFolder());
libraryRefresh.addEventListener("click", () => void refreshFolder());
libraryClose.addEventListener("click", () => void closeFolder());
librarySearch.addEventListener("submit", (event) => { event.preventDefault(); void searchFolder(); });
librarySearchInput.addEventListener("search", () => { if (librarySearchInput.value === "") void searchFolder(); });
librarySearchCancel.addEventListener("click", () => void cancelFolderSearch());
for (const option of [libraryMatchCase, libraryWholeWord]) {
  option.addEventListener("change", () => { if (librarySearchInput.value.trim() !== "") void searchFolder(); });
}
contentsFilter.addEventListener("input", filterContents);
searchInput.addEventListener("input", () => runSearch());
searchMatchCase.addEventListener("change", () => runSearch());
searchWholeWord.addEventListener("change", () => runSearch());
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
backToTop.addEventListener("click", () => reader.scrollTo({ top: 0, behavior: "smooth" }));
remoteImagesOnce.addEventListener("click", () => void loadRemoteImagesOnce());
remoteImagesAlways.addEventListener("click", () => void setRemoteImagesGlobally("allow"));
remoteImagesBlock.addEventListener("click", () => void setRemoteImagesGlobally("block"));
aboutClose.addEventListener("click", closeAbout);
aboutDone.addEventListener("click", closeAbout);
aboutEmail.addEventListener("click", () => void window.mdViewer.openExternal("mailto:peter@techguypeter.com"));
for (const button of document.querySelectorAll<HTMLButtonElement>(".copy-contact[data-copy]")) {
  button.addEventListener("click", () => void copyContact(button.dataset.copy ?? ""));
}
aboutDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAbout();
});
recentClose.addEventListener("click", closeRecentFiles);
recentDone.addEventListener("click", closeRecentFiles);
recentDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeRecentFiles(); });
recentClear.addEventListener("click", () => void window.mdViewer.clearRecentFiles().then(() => renderRecentFiles([])).catch((error: unknown) => showToast(describeError(error))));
reopenLast.addEventListener("change", scheduleSettingsSave);
appearanceClose.addEventListener("click", closeAppearance);
appearanceDone.addEventListener("click", closeAppearance);
appearanceDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeAppearance(); });
for (const control of [readerFont, fontSize, lineHeight, readingWidth, paragraphSpacing]) {
  control.addEventListener("input", scheduleSettingsSave);
}
appearanceReset.addEventListener("click", () => {
  readerSettings = { ...DEFAULT_READER_SETTINGS, reopenLastDocument: readerSettings.reopenLastDocument };
  syncAppearanceControls();
  scheduleSettingsSave();
});

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
  if (event.key !== "Escape" || aboutDialog.open || recentDialog.open || appearanceDialog.open) {
    return;
  }
  if (!searchBar.hidden) {
    hideSearch();
  } else if (isFullscreen) {
    event.preventDefault();
    void toggleFullscreen();
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

window.mdViewer.onOpenPath((filePath) => enqueueOpenPath(filePath));
window.mdViewer.onDocumentState(({ path, state }) => {
  if (currentDocument?.path !== path) {
    return;
  }
  if (state === "missing") {
    pendingRecoverySnapshot = captureReadingState();
    showError(new Error("The file is no longer at its original location."), path);
  } else {
    const snapshot = state === "restored" ? pendingRecoverySnapshot : null;
    pendingRecoverySnapshot = null;
    enqueueOpenPath(path, true, snapshot);
  }
});
window.mdViewer.onCommand(handleCommand);
window.mdViewer.onAboutRequested(() => void showAbout());
window.mdViewer.onFullscreenChanged(updateFullscreenControl);
window.mdViewer.onRecentFilesChanged((files) => {
  if (recentDialog.open) renderRecentFiles(files);
});
window.addEventListener("beforeunload", () => saveCurrentReadingState(true));

applyTheme(initialTheme());
appShell.classList.toggle("contents-collapsed", window.innerWidth < 900);

async function initialiseRenderer(): Promise<void> {
  const storedPolicy = localStorage.getItem("remote-image-policy");
  try {
    const [mainPolicy, savedSettings] = await Promise.all([
      window.mdViewer.getRemoteImagePolicy(),
      window.mdViewer.getSettings(),
    ]);
    remoteImagePolicy = storedPolicy === "allow" || storedPolicy === "block" ? storedPolicy : mainPolicy;
    readerSettings = normaliseReaderSettings(savedSettings);
    applyReaderSettings(article, readerSettings);
    syncAppearanceControls();
    await window.mdViewer.setRemoteImagePolicy(remoteImagePolicy);
  } catch {
    remoteImagePolicy = "block";
    readerSettings = DEFAULT_READER_SETTINGS;
    applyReaderSettings(article, readerSettings);
    syncAppearanceControls();
  } finally {
    updateNavigationControls();
    window.mdViewer.rendererReady();
    notifyRendered();
  }
}

void initialiseRenderer();
