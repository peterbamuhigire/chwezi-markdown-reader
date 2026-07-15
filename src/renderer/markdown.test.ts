import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMarkdownFilename, renderMarkdown, slugifyHeading } from "./markdown";

const fixture = (name: string): string => readFileSync(
  resolve(process.cwd(), "tests", "fixtures", name),
  "utf8",
);

describe("renderMarkdown", () => {
  it("renders GitHub-flavoured tables and task lists", () => {
    const result = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] Done");

    expect(result.html).toContain("<table>");
    expect(result.html).toContain("type=\"checkbox\"");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("renders the supported Markdown profile fixture", () => {
    const result = renderMarkdown(fixture("markdown-profile.md"));
    const container = document.createElement("div");
    container.innerHTML = result.html;

    expect(container.querySelector("h1")?.textContent).toBe("Reader profile");
    expect(container.querySelector("del")?.textContent).toBe("removed");
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted text");
    expect(container.querySelector("ol ul li")?.textContent).toContain("Nested item");
    expect(container.querySelector("input[type=checkbox]:checked")).not.toBeNull();
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    expect(container.querySelector("pre code.language-ts")?.textContent).toContain("const answer = 42");
    expect(container.querySelector("a[href='#non-latin-heading']")?.textContent).toBe("fragment");
    expect(container.querySelector("a[href='guide.md']")?.textContent).toBe("relative document");
  });

  it("removes scripts and dangerous link protocols", () => {
    const result = renderMarkdown("<script>alert(1)</script><style>body{display:none}</style>\n\n[Bad](javascript:alert(1))\n\n<p style=\"position:fixed\">Text</p>");

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("<style");
    expect(result.html).not.toContain("position:fixed");
    expect(result.html).not.toContain("javascript:");
  });

  it("sanitises active-content and attribute attacks from a fixture", () => {
    const result = renderMarkdown(fixture("sanitisation-attacks.md"));
    const container = document.createElement("div");
    container.innerHTML = result.html;

    expect(container.querySelector("script, style, iframe, object, embed, form, svg")).toBeNull();
    expect(container.querySelector("[style], [onclick], [onerror]")).toBeNull();
    expect(result.html).not.toMatch(/javascript:|data:text\/html|file:\/\//i);
    expect(container.querySelector("a[href='https://example.com/path']")?.textContent).toBe("Safe web link");
    expect(container.querySelector("img[src='data:image/png;base64,iVBORw0KGgo=']")).not.toBeNull();
  });

  it("blocks remote images by default and reports how many were withheld", () => {
    const result = renderMarkdown("![Tracking pixel](https://tracker.example/pixel.gif)\n\n![CDN](//cdn.example/image.png)");
    const container = document.createElement("div");
    container.innerHTML = result.html;

    expect(result.remoteImageCount).toBe(2);
    expect(container.querySelectorAll("img[src]")).toHaveLength(0);
    expect(container.querySelector("img")?.getAttribute("data-chwezi-remote-src")).toBe("https://tracker.example/pixel.gif");
  });

  it("allows remote images only when the caller selects the allow policy", () => {
    const allowed = renderMarkdown("![Image](https://images.example/photo.jpg)", { remoteImages: "allow" });
    const blockedAfterward = renderMarkdown("![Image](https://images.example/photo.jpg)");
    const allowedContainer = document.createElement("div");
    const blockedContainer = document.createElement("div");
    allowedContainer.innerHTML = allowed.html;
    blockedContainer.innerHTML = blockedAfterward.html;

    expect(allowed.remoteImageCount).toBe(1);
    expect(allowedContainer.querySelector("img")?.getAttribute("src")).toBe("https://images.example/photo.jpg");
    expect(blockedContainer.querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(blockedContainer.querySelector("img")?.getAttribute("data-chwezi-remote-src")).toBe("https://images.example/photo.jpg");
  });

  it("counts prose while excluding code and Markdown links", () => {
    const result = renderMarkdown("One two three four.\n\n`ignored inline code`\n\n```ts\nignored fenced code\n```\n\n[Link label](https://example.com/long/path)");

    expect(result.wordCount).toBe(4);
    expect(result.readingMinutes).toBe(1);
  });

  it("rounds reading time up at the 220 word boundary", () => {
    expect(renderMarkdown(Array.from({ length: 220 }, () => "word").join(" ")).readingMinutes).toBe(1);
    expect(renderMarkdown(Array.from({ length: 221 }, () => "word").join(" ")).readingMinutes).toBe(2);
  });

  it("handles empty and Unicode-only documents", () => {
    expect(renderMarkdown("").wordCount).toBe(0);
    expect(renderMarkdown("").readingMinutes).toBe(1);

    const result = renderMarkdown("مرحبا بالعالم\n\n你好世界\n\n👩🏾‍💻");
    expect(result.html).toContain("مرحبا بالعالم");
    expect(result.html).toContain("你好世界");
    expect(result.wordCount).toBe(4);
  });
});

describe("document helpers", () => {
  it("builds stable readable heading slugs", () => {
    expect(slugifyHeading("  Résumé & Next Steps  ")).toBe("resume-next-steps");
    expect(slugifyHeading("***")).toBe("section");
  });

  it("preserves non-Latin letters and normalises combining marks", () => {
    expect(slugifyHeading("日本語の見出し")).toBe("日本語の見出し");
    expect(slugifyHeading("Cafe\u0301 déjà vu")).toBe("cafe-deja-vu");
    expect(slugifyHeading("مرحبا بالعالم")).toBe("مرحبا-بالعالم");
  });

  it("accepts supported Markdown file extensions only", () => {
    expect(isMarkdownFilename("README.MD")).toBe(true);
    expect(isMarkdownFilename("notes.markdown")).toBe(true);
    expect(isMarkdownFilename("notes.txt")).toBe(false);
    expect(isMarkdownFilename("notes.md.exe")).toBe(false);
    expect(isMarkdownFilename("notes.md ")).toBe(false);
    expect(isMarkdownFilename(".md")).toBe(true);
  });
});
