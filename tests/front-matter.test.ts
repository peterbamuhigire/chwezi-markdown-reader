// @vitest-environment node

import { describe, expect, it } from "vitest";
import { extractFrontMatter } from "../src/renderer/front-matter";

describe("front matter extraction", () => {
  it("extracts a bounded scalar profile and leaves Markdown body intact", () => {
    const source = [
      "---",
      "title: 'Field notes'",
      "author: Peter Bamuhigire",
      "language: Luganda",
      "published: 2026-07-15",
      "---",
      "# First heading",
      "",
      "Body text.",
    ].join("\n");

    expect(extractFrontMatter(source)).toEqual({
      fields: [
        { name: "title", value: "Field notes" },
        { name: "author", value: "Peter Bamuhigire" },
        { name: "language", value: "Luganda" },
        { name: "published", value: "2026-07-15" },
      ],
      body: "# First heading\n\nBody text.",
    });
  });

  it.each(["\n", "\r\n"])("handles UTF-8 BOM and %s line endings without losing body characters", (newline) => {
    const source = `\uFEFF---${newline}title: Résumé${newline}...${newline}# Café`;
    const result = extractFrontMatter(source);

    expect(result.fields).toEqual([{ name: "title", value: "Résumé" }]);
    expect(result.body).toBe("# Café");
  });

  it("treats markup in scalar values as inert data", () => {
    const result = extractFrontMatter([
      "---",
      "title: <img src=x onerror=alert(1)>",
      "tag: !!js/function alert(1)",
      "anchor: &secret value",
      "inline: { nested: value }",
      "---",
      "# Safe",
    ].join("\n"));

    expect(result.fields).toEqual([
      { name: "title", value: "<img src=x onerror=alert(1)>" },
      { name: "tag", value: "!!js/function alert(1)" },
      { name: "anchor", value: "&secret value" },
      { name: "inline", value: "{ nested: value }" },
    ]);
    expect(result.body).toBe("# Safe");
  });

  it.each([
    "---\ntags:\n  - unsafe\n---\n# Body",
    "---\nno colon here\n---\n# Body",
    "---\ntitle: Unclosed\n# Body",
    "---\n---\n# Body",
  ])("leaves unsupported or malformed YAML unchanged", (source) => {
    expect(extractFrontMatter(source)).toEqual({ body: source, fields: [] });
  });

  it("fails closed when field and byte caps are exceeded", () => {
    const tooManyFields = `---\n${Array.from({ length: 101 }, (_, index) => `field${index}: value`).join("\n")}\n---\n# Body`;
    const tooManyBytes = `---\ntitle: ${"a".repeat((64 * 1024) + 1)}\n---\n# Body`;
    const tooManyMultibyteBytes = `---\ntitle: ${"\u{1F30D}".repeat(20_000)}\n---\n# Body`;

    expect(extractFrontMatter(tooManyFields)).toEqual({ body: tooManyFields, fields: [] });
    expect(extractFrontMatter(tooManyBytes)).toEqual({ body: tooManyBytes, fields: [] });
    expect(extractFrontMatter(tooManyMultibyteBytes)).toEqual({ body: tooManyMultibyteBytes, fields: [] });
  });

  it("measures the complete front matter block against the UTF-8 byte cap", () => {
    const exactValue = "é".repeat(32_760);
    const exactLimit = `---\ntitle: ${exactValue}\n---\n# Body`;
    const oneByteOver = `---\ntitle: ${exactValue}a\n---\n# Body`;

    expect(new TextEncoder().encode(exactLimit.slice(0, exactLimit.indexOf("# Body"))).byteLength).toBe(64 * 1024);
    expect(extractFrontMatter(exactLimit)).toEqual({
      body: "# Body",
      fields: [{ name: "title", value: exactValue }],
    });
    expect(extractFrontMatter(oneByteOver)).toEqual({ body: oneByteOver, fields: [] });
  });
});
