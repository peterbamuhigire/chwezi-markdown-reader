// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createStandaloneHtmlPayload, STANDALONE_HTML_CSS } from "../src/renderer/html-export";

function renderSource(html: string): HTMLElement {
  const article = document.createElement("article");
  article.innerHTML = html;
  document.body.replaceChildren(article);
  return article;
}

describe("standalone HTML renderer payload", () => {
  it("removes application controls and tokenises authorised local images", () => {
    const source = renderSource([
      "<h1>Field notes</h1>",
      '<button data-chwezi-ui="copy-code">Copy code</button>',
      '<img alt="Map" src="file:///C:/notes/images/map.png">',
    ].join(""));

    const payload = createStandaloneHtmlPayload(source);

    expect(payload.bodyHtml).toContain("Field notes");
    expect(payload.bodyHtml).not.toContain("Copy code");
    expect(payload.bodyHtml).toMatch(/src="__CHWEZI_RESOURCE_[0-9a-f-]{36}_0001__"/u);
    expect(payload.resources).toHaveLength(1);
    expect(payload.resources[0]?.token).toMatch(/^__CHWEZI_RESOURCE_[0-9a-f-]{36}_0001__$/u);
    expect(payload.resources[0]?.fileUrl).toBe("file:///C:/notes/images/map.png");
    expect(source.querySelector("button")).not.toBeNull();
    expect(source.querySelector("img")?.getAttribute("src")).toBe("file:///C:/notes/images/map.png");
  });

  it("omits remote image addresses while retaining useful alternative text", () => {
    const source = renderSource([
      '<img alt="Chart" src="https://tracker.example/chart.png">',
      '<img alt="Blocked pixel" data-chwezi-remote-src="https://tracker.example/pixel.gif">',
    ].join(""));

    const payload = createStandaloneHtmlPayload(source);
    const exported = renderSource(payload.bodyHtml);
    const images = exported.querySelectorAll("img");

    expect(payload.bodyHtml).not.toMatch(/tracker\.example|data-chwezi-remote-src/iu);
    expect(images[0]?.hasAttribute("src")).toBe(false);
    expect(images[0]?.alt).toContain("remote image omitted");
    expect(images[1]?.hasAttribute("src")).toBe(false);
    expect(images[1]?.hasAttribute("data-chwezi-remote-src")).toBe(false);
  });

  it("preserves inline data images without classifying them as local resources", () => {
    const source = renderSource('<img alt="Inline" src="data:image/png;base64,iVBORw0KGgo=">');

    const payload = createStandaloneHtmlPayload(source);

    expect(payload.resources).toEqual([]);
    expect(payload.bodyHtml).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("omits SVG resources with conversion guidance", () => {
    const source = renderSource('<img alt="Diagram" src="file:///C:/notes/diagram.svg"><img alt="Inline" src="data:image/svg+xml,%3Csvg/%3E">');

    const payload = createStandaloneHtmlPayload(source);

    expect(payload.resources).toEqual([]);
    expect(payload.bodyHtml).not.toMatch(/diagram\.svg|data:image\/svg\+xml/iu);
    expect(payload.bodyHtml).toContain("convert to PNG");
  });

  it("ships neutral offline CSS without remote imports or URLs", () => {
    expect(STANDALONE_HTML_CSS).toContain("color-scheme:light");
    expect(STANDALONE_HTML_CSS).toContain("@media print");
    expect(STANDALONE_HTML_CSS).not.toMatch(/@import|url\(\s*["']?\s*(?:https?:|file:|\/\/)/iu);
  });
});
