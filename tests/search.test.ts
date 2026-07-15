// @vitest-environment node

import { describe, expect, it } from "vitest";
import { findTextMatches, isRelativeMarkdownHref } from "../src/renderer/search";

describe("findTextMatches", () => {
  it("finds every non-overlapping match and honours case sensitivity", () => {
    expect(findTextMatches("Reader reader READER", "reader", { matchCase: false, wholeWord: false })).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
      { start: 14, end: 20 },
    ]);
    expect(findTextMatches("Reader reader READER", "reader", { matchCase: true, wholeWord: false })).toEqual([
      { start: 7, end: 13 },
    ]);
  });

  it("treats regex punctuation as literal search text", () => {
    expect(findTextMatches("a+b and a.b and a+b", "a+b", { matchCase: true, wholeWord: false })).toEqual([
      { start: 0, end: 3 },
      { start: 16, end: 19 },
    ]);
  });

  it("uses Unicode letters, numbers, marks, and underscores for whole-word boundaries", () => {
    const text = "café cafés cafe _cafe cafe2 مرحبا،مرحبا";
    expect(findTextMatches(text, "cafe", { matchCase: false, wholeWord: true })).toEqual([
      { start: 12, end: 16 },
    ]);
    expect(findTextMatches(text, "مرحبا", { matchCase: true, wholeWord: true })).toHaveLength(2);
  });

  it("returns no matches for an empty query", () => {
    expect(findTextMatches("reader", "", { matchCase: false, wholeWord: false })).toEqual([]);
  });
});

describe("relative Markdown link classification", () => {
  it.each([
    "guide.md",
    "folder/next.markdown#heading",
    "notes with spaces.mdown",
    "./chapter.mkd",
    "../sibling.md",
  ])("classifies %s as a reader document link", (href) => {
    expect(isRelativeMarkdownHref(href)).toBe(true);
  });

  it.each([
    "#heading",
    "https://example.com/file.md",
    "mailto:reader@example.com",
    "file:///secret.md",
    "//example.com/file.md",
    "notes.pdf",
    "",
  ])("does not classify %s as a relative reader document", (href) => {
    expect(isRelativeMarkdownHref(href)).toBe(false);
  });
});
