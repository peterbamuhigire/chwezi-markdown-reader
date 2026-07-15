import { describe, expect, it } from "vitest";
import { readerSettingsSchema } from "../src/main/ipc-contracts";
import { DEFAULT_READER_SETTINGS as STORED_DEFAULTS } from "../src/main/settings-store";
import {
  applyReaderSettings,
  DEFAULT_READER_SETTINGS,
  normaliseReaderSettings,
  type ReaderSettings,
} from "../src/renderer/reader-settings";

describe("reader appearance contract", () => {
  it("uses one default across renderer, validation, and persistence", () => {
    expect(DEFAULT_READER_SETTINGS).toEqual(STORED_DEFAULTS);
    expect(readerSettingsSchema.parse(DEFAULT_READER_SETTINGS)).toEqual(DEFAULT_READER_SETTINGS);
  });

  it("clamps every numeric setting to the supported visual range", () => {
    const below = normaliseReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 1,
      lineHeight: 0,
      readingWidth: 1,
      paragraphSpacing: 0,
    });
    const above = normaliseReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 100,
      lineHeight: 10,
      readingWidth: 10_000,
      paragraphSpacing: 10,
    });

    expect(below).toMatchObject({ fontSize: 14, lineHeight: 1.4, readingWidth: 620, paragraphSpacing: 0.7 });
    expect(above).toMatchObject({ fontSize: 24, lineHeight: 2, readingWidth: 1_080, paragraphSpacing: 1.8 });
    expect(readerSettingsSchema.safeParse(below).success).toBe(true);
    expect(readerSettingsSchema.safeParse(above).success).toBe(true);
  });

  it.each<[ReaderSettings["fontFamily"], string]>([
    ["serif", 'Georgia, "Times New Roman", serif'],
    ["sans", '"Segoe UI Variable", "Segoe UI", sans-serif'],
    ["system", 'system-ui, -apple-system, "Segoe UI", sans-serif'],
  ])("maps the %s font and numeric values to reader CSS variables", (fontFamily, expectedStack) => {
    const element = document.createElement("article");
    applyReaderSettings(element, {
      fontFamily,
      fontSize: 19,
      lineHeight: 1.8,
      readingWidth: 900,
      paragraphSpacing: 1.25,
      reopenLastDocument: true,
    });

    expect(element.style.getPropertyValue("--reader-font-family")).toBe(expectedStack);
    expect(element.style.getPropertyValue("--reader-font-size")).toBe("19px");
    expect(element.style.getPropertyValue("--reader-line-height")).toBe("1.8");
    expect(element.style.getPropertyValue("--reader-width")).toBe("900px");
    expect(element.style.getPropertyValue("--reader-paragraph-spacing")).toBe("1.25em");
  });
});
