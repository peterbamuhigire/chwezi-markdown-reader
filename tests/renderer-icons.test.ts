// @vitest-environment jsdom

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve("src/renderer/index.html"), "utf8");
const css = readFileSync(resolve("src/renderer/styles.css"), "utf8");
const assetsDirectory = resolve("src/renderer/assets");

describe("renderer icon assets", () => {
  it("keeps every referenced local asset in the renderer bundle", () => {
    const references = [...css.matchAll(/url\(["']?(\.\/assets\/[^"')]+)["']?\)/gu)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(existsSync(resolve("src/renderer", reference)), `missing ${reference}`).toBe(true);
    }
  });

  it("defines an icon source for every icon class used by renderer controls", () => {
    const rendererDocument = new DOMParser().parseFromString(html, "text/html");
    const iconClasses = [...rendererDocument.querySelectorAll<HTMLElement>("[class]")]
      .flatMap((element) => [...element.classList])
      .filter((className) => className.startsWith("icon-") && className !== "icon-button");
    expect(iconClasses.length).toBeGreaterThan(0);
    for (const iconClass of new Set(iconClasses)) {
      expect(css, `missing CSS asset mapping for .${iconClass}`).toMatch(
        new RegExp(`\\.${iconClass}\\s*\\{[^}]*--(?:asset|mask)-icon\\s*:`, "u"),
      );
    }
  });

  it("rejects executable or network-capable SVG content", () => {
    const svgFiles = readdirSync(assetsDirectory).filter((name) => name.endsWith(".svg"));
    expect(svgFiles.length).toBeGreaterThan(0);

    for (const name of svgFiles) {
      const source = readFileSync(resolve(assetsDirectory, name), "utf8");
      expect(source, name).not.toMatch(/<script\b|<foreignObject\b/iu);
      expect(source, name).not.toMatch(/\son[a-z]+\s*=/iu);
      expect(source, name).not.toMatch(/(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:|\/\/)/iu);
      expect(source, name).toMatch(/<svg\b/iu);
    }
  });

  it("keeps icon-only controls explicitly named", () => {
    const rendererDocument = new DOMParser().parseFromString(html, "text/html");
    const iconControls = [...rendererDocument.querySelectorAll<HTMLElement>("button, summary")].filter((control) => {
      const clone = control.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[aria-hidden="true"]').forEach((element) => element.remove());
      return (clone.textContent?.trim() ?? "") === "";
    });

    expect(iconControls.length).toBeGreaterThan(0);
    for (const control of iconControls) {
      expect(
        control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby"),
        `unnamed icon control: ${control.id || basename(control.outerHTML)}`,
      ).toBe(true);
    }
  });

  it("defines a high-contrast-safe icon rendering path", () => {
    expect(css).toMatch(/(?:mask(?:-image)?\s*:|@media\s*\(forced-colors:\s*active\))/iu);
  });
});
