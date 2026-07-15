import { describe, expect, it } from "vitest";
import { isMarkdownFilename, renderMarkdown, slugifyHeading } from "./markdown";

describe("renderMarkdown", () => {
  it("renders GitHub-flavoured tables and task lists", () => {
    const result = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] Done");

    expect(result.html).toContain("<table>");
    expect(result.html).toContain("type=\"checkbox\"");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("removes scripts and dangerous link protocols", () => {
    const result = renderMarkdown("<script>alert(1)</script><style>body{display:none}</style>\n\n[Bad](javascript:alert(1))\n\n<p style=\"position:fixed\">Text</p>");

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("<style");
    expect(result.html).not.toContain("position:fixed");
    expect(result.html).not.toContain("javascript:");
  });
});

describe("document helpers", () => {
  it("builds stable readable heading slugs", () => {
    expect(slugifyHeading("  Résumé & Next Steps  ")).toBe("resume-next-steps");
    expect(slugifyHeading("***")).toBe("section");
  });

  it("accepts supported Markdown file extensions only", () => {
    expect(isMarkdownFilename("README.MD")).toBe(true);
    expect(isMarkdownFilename("notes.markdown")).toBe(true);
    expect(isMarkdownFilename("notes.txt")).toBe(false);
  });
});
