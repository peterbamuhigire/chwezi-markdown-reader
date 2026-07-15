// @vitest-environment node

import { mkdtemp, rm, truncate, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentService } from "../src/main/document-service";
import { MAX_DOCUMENT_BYTES } from "../src/main/ipc-contracts";

describe.sequential("DocumentService filesystem and encoding integration", () => {
  let directory = "";
  let service: DocumentService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-document-service-"));
    service = new DocumentService();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("requires an explicit file grant and does not authorise adjacent files", async () => {
    const grantedPath = join(directory, "granted.md");
    const adjacentPath = join(directory, "adjacent.md");
    await writeFile(grantedPath, "# Granted", "utf8");
    await writeFile(adjacentPath, "# Adjacent", "utf8");

    await expect(service.load(grantedPath)).rejects.toThrow("Open this Markdown file");
    await service.grant(grantedPath);
    await expect(service.load(grantedPath)).resolves.toMatchObject({ name: "granted.md", content: "# Granted" });
    await expect(service.load(adjacentPath)).rejects.toThrow("Open this Markdown file");
  });

  it("decodes UTF-8 strictly and strips one UTF-8 BOM", async () => {
    const filePath = join(directory, "unicode.md");
    const content = "# Résumé\r\n\r\nمرحبا 👩🏾‍💻";
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, "utf8")]);
    await writeFile(filePath, bytes);
    await service.grant(filePath);

    const payload = await service.load(filePath);

    expect(payload.content).toBe(content);
    expect(payload.content.charCodeAt(0)).not.toBe(0xfeff);
    expect(payload.size).toBe(bytes.byteLength);
    expect(payload.fileUrl).toMatch(/^file:\/\//);
  });

  it("rejects malformed UTF-8 instead of inserting replacement characters", async () => {
    const filePath = join(directory, "invalid.md");
    await writeFile(filePath, Buffer.from([0x23, 0x20, 0xc3, 0x28]));
    await service.grant(filePath);

    await expect(service.load(filePath)).rejects.toThrow("not valid UTF-8");
  });

  it.each([
    ["UTF-16 LE", Buffer.from([0xff, 0xfe, 0x23, 0x00])],
    ["UTF-16 BE", Buffer.from([0xfe, 0xff, 0x00, 0x23])],
  ])("rejects %s with an actionable encoding error", async (_label, bytes) => {
    const filePath = join(directory, "utf16.md");
    await writeFile(filePath, bytes);
    await service.grant(filePath);

    await expect(service.load(filePath)).rejects.toThrow("This file is UTF-16");
  });

  it("rejects a document larger than the reading ceiling before reading", async () => {
    const filePath = join(directory, "oversized.md");
    await writeFile(filePath, "", "utf8");
    await truncate(filePath, MAX_DOCUMENT_BYTES + 1);
    await service.grant(filePath);

    await expect(service.load(filePath)).rejects.toThrow("larger than the 20 MB reading limit");
  });

  it("preserves an explicit grant when a missing path is recreated", async () => {
    const filePath = join(directory, "recreated.md");
    await writeFile(filePath, "temporary", "utf8");
    await service.grant(filePath);
    await unlink(filePath);
    await expect(service.load(filePath)).rejects.toThrow("no longer available");

    await writeFile(filePath, "# Recreated", "utf8");
    await expect(service.load(filePath)).resolves.toMatchObject({ content: "# Recreated" });
  });
});
