// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const rendererHtml = readFileSync(resolve("src/renderer/index.html"), "utf8");
const rendererCss = readFileSync(resolve("src/renderer/styles.css"), "utf8");
const rendererSource = readFileSync(resolve("src/renderer/app.ts"), "utf8");
let rendererDocument: Document;

describe("renderer accessibility contracts", () => {
  beforeAll(() => {
    rendererDocument = new DOMParser().parseFromString(rendererHtml, "text/html");
  });

  it("keeps document language, landmarks, and unique identifiers", () => {
    expect(rendererDocument.documentElement.lang).toBe("en");
    expect(rendererDocument.querySelector("header")).not.toBeNull();
    expect(rendererDocument.querySelector("main")).not.toBeNull();
    expect(rendererDocument.querySelector("footer")).not.toBeNull();
    expect(rendererDocument.querySelector("article[aria-label], section.reader[aria-label]")).not.toBeNull();

    const ids = [...rendererDocument.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every button and disclosure an accessible name", () => {
    const unnamed = [...rendererDocument.querySelectorAll<HTMLElement>("button, summary")].filter((control) => {
      const visibleText = control.textContent?.trim() ?? "";
      return visibleText.length === 0
        && !control.hasAttribute("aria-label")
        && !control.hasAttribute("aria-labelledby");
    });
    expect(unnamed.map((control) => control.id || control.outerHTML)).toEqual([]);
  });

  it("associates every form control with a label", () => {
    const labels = [...rendererDocument.querySelectorAll<HTMLLabelElement>("label[for]")];
    const unlabelled = [...rendererDocument.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")]
      .filter((control) => {
        if (control.getAttribute("aria-label") !== null || control.getAttribute("aria-labelledby") !== null) {
          return false;
        }
        if (control.closest("label") !== null) {
          return false;
        }
        return control.id.length === 0 || !labels.some((label) => label.htmlFor === control.id);
      });
    expect(unlabelled.map((control) => control.id || control.outerHTML)).toEqual([]);
  });

  it("keeps dialogs named and all ARIA references valid", () => {
    for (const dialog of rendererDocument.querySelectorAll<HTMLDialogElement>("dialog")) {
      expect(dialog.hasAttribute("aria-label") || dialog.hasAttribute("aria-labelledby")).toBe(true);
    }
    for (const element of rendererDocument.querySelectorAll<HTMLElement>("[aria-labelledby], [aria-describedby]")) {
      for (const attribute of ["aria-labelledby", "aria-describedby"] as const) {
        const references = element.getAttribute(attribute)?.split(/\s+/u).filter(Boolean) ?? [];
        for (const reference of references) {
          expect(rendererDocument.getElementById(reference), `${attribute} references missing #${reference}`).not.toBeNull();
        }
      }
    }
  });

  it("provides status/error announcements without positive tab order", () => {
    expect(rendererDocument.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendererDocument.querySelector('[role="status"], [aria-live="polite"]')).not.toBeNull();
    expect(rendererDocument.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
  });

  it("retains keyboard focus and reduced-motion CSS gates", () => {
    expect(rendererCss).toMatch(/:focus-visible/u);
    expect(rendererCss).toMatch(/prefers-reduced-motion:\s*reduce/u);
  });

  it("connects navigation tabs to one named panel with a matching selected state", () => {
    const tabs = [...rendererDocument.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')];
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);

    for (const tab of tabs) {
      const panelId = tab.getAttribute("aria-controls");
      const panel = panelId === null ? null : rendererDocument.getElementById(panelId);
      expect(panel, `missing panel for #${tab.id}`).not.toBeNull();
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panel?.hasAttribute("hidden")).toBe(tab.getAttribute("aria-selected") !== "true");
    }
  });

  it("keeps one tab stop in the navigator and exposes the active library document", () => {
    const tabs = [...rendererDocument.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]')];
    for (const tab of tabs) {
      const expectedTabIndex = tab.getAttribute("aria-selected") === "true" ? "0" : "-1";
      expect(tab.getAttribute("tabindex") ?? "0", `unexpected tab stop for #${tab.id}`).toBe(expectedTabIndex);
    }
    expect(rendererSource).toMatch(/outlineTab\.tabIndex\s*=|outlineTab\.setAttribute\(["']tabindex["']/u);
    expect(rendererSource).toMatch(/libraryTab\.tabIndex\s*=|libraryTab\.setAttribute\(["']tabindex["']/u);
    expect(rendererSource).toMatch(/aria-current/u);
  });

  it("hides privacy notices and application-only controls from print output", () => {
    expect(rendererCss).toMatch(/@media print\s*\{[\s\S]*?\.remote-image-banner[\s\S]*?display:\s*none\s*!important/iu);
    expect(rendererCss).toMatch(/@media print\s*\{[\s\S]*?\[data-chwezi-ui\][\s\S]*?display:\s*none\s*!important/iu);
  });
});
