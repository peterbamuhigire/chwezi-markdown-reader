// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentService } from "../src/main/document-service";
import { resolveRelativeMarkdownTarget } from "../src/main/link-policy";

describe("relative Markdown link policy", () => {
  const currentPath = resolve("library", "current.md");

  it("resolves paths, spaces, and decoded fragments within the current folder", () => {
    expect(resolveRelativeMarkdownTarget("chapters/next%20chapter.md#R%C3%A9sum%C3%A9", currentPath)).toEqual({
      path: resolve("library", "chapters", "next chapter.md"),
      fragment: "Résumé",
    });
  });

  it.each([
    "../outside.md",
    "%2e%2e/outside.md",
    "https://example.com/remote.md",
    "file:///secret.md",
    "//example.com/remote.md",
    "\\\\server\\share\\remote.md",
    "notes.pdf",
    "notes.md?download=1",
    "",
  ])("rejects unsafe or unsupported target %s", (href) => {
    expect(() => resolveRelativeMarkdownTarget(href, currentPath)).toThrow();
  });

  it("rejects malformed and overlong fragments", () => {
    expect(() => resolveRelativeMarkdownTarget("next.md#%E0%A4%A", currentPath)).toThrow("invalid fragment");
    expect(() => resolveRelativeMarkdownTarget(`next.md#${"a".repeat(4_097)}`, currentPath)).toThrow("fragment is too long");
  });
});

describe.sequential("relative document opening integration", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-links-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("opens and grants a linked Markdown document without granting arbitrary neighbours", async () => {
    const currentPath = join(directory, "current.md");
    const nextPath = join(directory, "next.md");
    const unrelatedPath = join(directory, "unrelated.md");
    await writeFile(currentPath, "[Next](next.md#details)", "utf8");
    await writeFile(nextPath, "# Details", "utf8");
    await writeFile(unrelatedPath, "# Unrelated", "utf8");
    const service = new DocumentService();
    await service.grant(currentPath);

    const result = await service.openRelative("next.md#details", currentPath);

    expect(result.document).toMatchObject({ path: nextPath, content: "# Details" });
    expect(result.fragment).toBe("details");
    await expect(service.load(nextPath)).resolves.toMatchObject({ name: "next.md" });
    await expect(service.load(unrelatedPath)).rejects.toThrow("Open this Markdown file");
  });

  it("does not grant traversal outside the current document folder", async () => {
    const childDirectory = join(directory, "child");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(childDirectory);
    const currentPath = join(childDirectory, "current.md");
    const outsidePath = join(directory, "outside.md");
    await writeFile(currentPath, "[Outside](../outside.md)", "utf8");
    await writeFile(outsidePath, "# Outside", "utf8");
    const service = new DocumentService();
    await service.grant(currentPath);

    await expect(service.openRelative("../outside.md", currentPath)).rejects.toThrow("outside the current document folder");
    await expect(service.load(outsidePath)).rejects.toThrow("Open this Markdown file");
  });
});
