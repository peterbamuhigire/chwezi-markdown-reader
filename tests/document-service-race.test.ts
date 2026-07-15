// @vitest-environment node

import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_DOCUMENT_BYTES } from "../src/main/ipc-contracts";

const fileSystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:fs/promises", () => fileSystem);

import { DocumentService } from "../src/main/document-service";

describe("DocumentService stat/read race", () => {
  it("applies the byte ceiling again after reading", async () => {
    const filePath = resolve("grew-during-read.md");
    fileSystem.realpath.mockResolvedValue(filePath);
    fileSystem.stat.mockResolvedValue({
      isFile: () => true,
      size: 128,
      mtimeMs: 1,
    });
    fileSystem.readFile.mockResolvedValue(Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x61));
    const service = new DocumentService();
    await service.grant(filePath);

    await expect(service.load(filePath)).rejects.toThrow("grew beyond the 20 MB reading limit");
  });
});
