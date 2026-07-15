// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  appCommandSchema,
  clipboardTextSchema,
  documentPayloadSchema,
  externalUrlSchema,
  filePathSchema,
  IPC_CHANNELS,
  MAX_CLIPBOARD_TEXT_BYTES,
  MAX_DOCUMENT_BYTES,
  remoteImagePolicySchema,
  readerSettingsPatchSchema,
  readingStateSchema,
  recentFilesSchema,
} from "../src/main/ipc-contracts";

describe("IPC boundary contracts", () => {
  it("accepts only supported Markdown paths", () => {
    expect(filePathSchema.parse("C:\\notes\\README.MD")).toBe("C:\\notes\\README.MD");
    expect(filePathSchema.safeParse("C:\\notes\\README.txt").success).toBe(false);
    expect(filePathSchema.safeParse("C:\\notes\\README.md.exe").success).toBe(false);
    expect(filePathSchema.safeParse("").success).toBe(false);
  });

  it("permits web and email URLs while rejecting local and active protocols", () => {
    for (const url of ["https://example.com", "http://example.com", "mailto:reader@example.com"]) {
      expect(externalUrlSchema.safeParse(url).success).toBe(true);
    }
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///C:/secret.md",
      "//example.com/path",
      "not a URL",
    ]) {
      expect(externalUrlSchema.safeParse(url).success).toBe(false);
    }
  });

  it("enforces document metadata and byte limits", () => {
    const validPayload = {
      path: "C:\\notes\\reader.md",
      fileUrl: "file:///C:/notes/reader.md",
      name: "reader.md",
      content: "# Reader",
      size: 8,
      modifiedAt: 1,
    };

    expect(documentPayloadSchema.safeParse(validPayload).success).toBe(true);
    expect(documentPayloadSchema.safeParse({ ...validPayload, size: MAX_DOCUMENT_BYTES + 1 }).success).toBe(false);
    expect(documentPayloadSchema.safeParse({ ...validPayload, modifiedAt: -1 }).success).toBe(false);
  });

  it("measures clipboard limits in UTF-8 bytes rather than JavaScript code units", () => {
    const exactAsciiLimit = "a".repeat(MAX_CLIPBOARD_TEXT_BYTES);
    const multibyteOverflow = "é".repeat((MAX_CLIPBOARD_TEXT_BYTES / 2) + 1);

    expect(clipboardTextSchema.safeParse(exactAsciiLimit).success).toBe(true);
    expect(clipboardTextSchema.safeParse(`${exactAsciiLimit}a`).success).toBe(false);
    expect(clipboardTextSchema.safeParse(multibyteOverflow).success).toBe(false);
  });

  it("keeps command, policy, and channel values closed and unambiguous", () => {
    expect(appCommandSchema.safeParse("open").success).toBe(true);
    expect(appCommandSchema.safeParse("delete-file").success).toBe(false);
    expect(remoteImagePolicySchema.safeParse("block").success).toBe(true);
    expect(remoteImagePolicySchema.safeParse("prompt").success).toBe(false);

    const channelNames = Object.values(IPC_CHANNELS);
    expect(new Set(channelNames).size).toBe(channelNames.length);
  });

  it("rejects empty or out-of-range appearance updates", () => {
    expect(readerSettingsPatchSchema.safeParse({ fontSize: 18, readingWidth: 900 }).success).toBe(true);
    expect(readerSettingsPatchSchema.safeParse({}).success).toBe(false);
    expect(readerSettingsPatchSchema.safeParse({ fontSize: 100 }).success).toBe(false);
    expect(readerSettingsPatchSchema.safeParse({ unknown: true }).success).toBe(false);
  });

  it("bounds persisted reading state and recent-file collections", () => {
    expect(readingStateSchema.safeParse({ headingId: "chapter", headingOffset: -20, scrollRatio: 0.5 }).success).toBe(true);
    expect(readingStateSchema.safeParse({ headingId: null, headingOffset: 0, scrollRatio: 1.1 }).success).toBe(false);

    const recent = Array.from({ length: 12 }, (_, index) => ({
      path: `C:\\notes\\${index}.md`,
      name: `${index}.md`,
      lastOpenedAt: index,
    }));
    expect(recentFilesSchema.safeParse(recent).success).toBe(true);
    expect(recentFilesSchema.safeParse([...recent, recent[0]]).success).toBe(false);
  });
});
