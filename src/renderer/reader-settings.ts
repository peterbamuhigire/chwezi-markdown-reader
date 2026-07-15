export type ReaderFont = "serif" | "sans" | "system";

export interface ReaderSettings {
  readonly fontFamily: ReaderFont;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly readingWidth: number;
  readonly paragraphSpacing: number;
  readonly reopenLastDocument: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: "serif",
  fontSize: 17,
  lineHeight: 1.72,
  readingWidth: 820,
  paragraphSpacing: 1.12,
  reopenLastDocument: false,
};

const FONT_STACKS: Readonly<Record<ReaderFont, string>> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI Variable", "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normaliseReaderSettings(settings: ReaderSettings): ReaderSettings {
  return {
    fontFamily: settings.fontFamily,
    fontSize: clamp(settings.fontSize, 14, 24),
    lineHeight: clamp(settings.lineHeight, 1.4, 2),
    readingWidth: clamp(settings.readingWidth, 620, 1080),
    paragraphSpacing: clamp(settings.paragraphSpacing, 0.7, 1.8),
    reopenLastDocument: settings.reopenLastDocument,
  };
}

export function applyReaderSettings(element: HTMLElement, settings: ReaderSettings): void {
  const safe = normaliseReaderSettings(settings);
  element.style.setProperty("--reader-font-family", FONT_STACKS[safe.fontFamily]);
  element.style.setProperty("--reader-font-size", `${safe.fontSize}px`);
  element.style.setProperty("--reader-line-height", String(safe.lineHeight));
  element.style.setProperty("--reader-width", `${safe.readingWidth}px`);
  element.style.setProperty("--reader-paragraph-spacing", `${safe.paragraphSpacing}em`);
}
