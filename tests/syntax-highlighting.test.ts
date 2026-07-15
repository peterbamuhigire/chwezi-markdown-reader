import { describe, expect, it, vi } from "vitest";
import { enhanceCodeBlocks } from "../src/renderer/syntax-highlighting";

function codeRoot(markup: string): HTMLElement {
  const root = document.createElement("article");
  root.innerHTML = markup;
  return root;
}

describe("syntax highlighting and code copy", () => {
  it("highlights a declared supported language and copies the original source", async () => {
    const root = codeRoot('<pre><code class="language-ts">const value: number = 42;</code></pre>');
    const copyCode = vi.fn(async () => undefined);

    enhanceCodeBlocks(root, copyCode);

    expect(root.querySelector("code")?.classList.contains("hljs")).toBe(true);
    expect(root.querySelector("code")?.innerHTML).toContain("hljs-keyword");
    expect(root.querySelector(".code-toolbar span")?.textContent).toBe("TypeScript");
    const button = root.querySelector<HTMLButtonElement>(".copy-code-button");
    expect(button?.getAttribute("aria-label")).toBe("Copy TypeScript block");
    button?.click();
    await vi.waitFor(() => expect(copyCode).toHaveBeenCalledWith("const value: number = 42;"));
  });

  it("keeps hostile code inert while retaining its exact copy source", async () => {
    const source = '<img src=x onerror="alert(1)">';
    const root = codeRoot(`<pre><code class="language-html">${source.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`);
    const copyCode = vi.fn(async () => undefined);

    enhanceCodeBlocks(root, copyCode);

    expect(root.querySelector("code img")).toBeNull();
    expect(root.querySelector("code")?.textContent).toBe(source);
    root.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() => expect(copyCode).toHaveBeenCalledWith(source));
  });

  it("adds copy controls without guessing an unknown language", () => {
    const root = codeRoot('<pre><code class="language-madeup">plain &amp; exact</code></pre>');
    enhanceCodeBlocks(root, async () => undefined);

    expect(root.querySelector("code")?.classList.contains("hljs")).toBe(false);
    expect(root.querySelector(".code-toolbar span")?.textContent).toBe("MADEUP");
    expect(root.querySelector("code")?.textContent).toBe("plain & exact");
  });

  it("is idempotent when a rendered document is enhanced twice", () => {
    const root = codeRoot("<pre><code>plain code</code></pre>");
    enhanceCodeBlocks(root, async () => undefined);
    enhanceCodeBlocks(root, async () => undefined);

    expect(root.querySelectorAll(".code-block")).toHaveLength(1);
    expect(root.querySelectorAll(".copy-code-button")).toHaveLength(1);
    expect(root.querySelector(".code-toolbar span")?.textContent).toBe("Code");
  });
});
