// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererFile = (name: string): string => readFileSync(resolve(process.cwd(), "src", "renderer", name), "utf8");

describe("renderer shell contracts", () => {
  it("uses navigation and native-button semantics for the folder browser", () => {
    const html = rendererFile("index.html");
    const app = rendererFile("app.ts");

    expect(html).toContain('<nav class="library-files" id="library-files" aria-label="Markdown files"></nav>');
    expect(html).not.toMatch(/role="tree(?:item)?"/u);
    expect(app).not.toMatch(/setAttribute\("role", "tree(?:item)?"\)/u);
    expect(app).toContain('file.setAttribute("aria-label", `Open ${entry.relativePath}`)');
  });

  it("excludes every application overlay from print and PDF output", () => {
    const css = rendererFile("styles.css");
    expect(css).toMatch(/\.topbar,[^{}]*\.remote-image-banner,[^{}]*\.back-to-top\s*\{\s*display:\s*none !important;/su);
  });

  it("provides distinct enter and exit full-screen visuals", () => {
    const html = rendererFile("index.html");
    const css = rendererFile("styles.css");
    expect(html).toContain("icon-fullscreen");
    expect(html).toContain("icon-exit-fullscreen");
    expect(css).toContain('#fullscreen-button[aria-pressed="true"] .icon-exit-fullscreen');
  });

  it("normalises action artwork through current-color masks while preserving format artwork", () => {
    const html = rendererFile("index.html");
    const css = rendererFile("styles.css");
    for (const icon of ["folder-open", "printer", "sun", "moon", "case-sensitive", "whole-word"]) {
      expect(html).toContain(`mask-icon icon-${icon}`);
      expect(css).toContain(`.icon-${icon} {`);
      expect(css).toMatch(new RegExp(`\\.icon-${icon} \\{[^}]*--mask-icon:`, "u"));
    }
    expect(html).toContain("asset-icon icon-file-html");
    expect(html).toContain("asset-icon icon-file-pdf");
    expect(html).toContain("mask-icon icon-chevron-down");
  });

  it("keeps copied interface SVGs passive and self-contained", () => {
    const assets = [
      "app-icon.svg", "arrow-left.svg", "arrow-right.svg", "case-sensitive.svg", "chevron-down.svg", "exit-fullscreen.svg",
      "external-link.svg", "file-html.svg", "file-pdf.svg", "folder-open.svg", "moon.svg", "printer.svg",
      "refresh.svg", "sun.svg", "whole-word.svg", "x-circle.svg",
    ];
    for (const asset of assets) {
      const svg = rendererFile(`assets/${asset}`);
      expect(svg, asset).not.toMatch(/<script\b|<foreignObject\b|\b(?:href|xlink:href)\s*=|url\(\s*https?:|data:/iu);
    }
  });
});
