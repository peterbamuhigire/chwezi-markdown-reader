// @vitest-environment node

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionService } from "../src/main/collection-service";
import {
  folderRelativePathSchema,
  MAX_DOCUMENT_BYTES,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_DOCUMENTS,
  MAX_FOLDER_SEARCH_RESULTS,
} from "../src/main/ipc-contracts";

async function writeFiles(directory: string, count: number): Promise<void> {
  const batchSize = 200;
  for (let start = 0; start < count; start += batchSize) {
    await Promise.all(Array.from({ length: Math.min(batchSize, count - start) }, async (_, offset) => {
      const index = start + offset;
      await writeFile(join(directory, `note-${String(index).padStart(5, "0")}.md`), "# Note", "utf8");
    }));
  }
}

describe.sequential("CollectionService containment and caps", () => {
  let root = "";
  let outside = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "chwezi-library-"));
    outside = await mkdtemp(join(tmpdir(), "chwezi-library-outside-"));
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  it("enumerates only Markdown documents and returns portable relative paths", async () => {
    await mkdir(join(root, "Guides"));
    await writeFile(join(root, "README.md"), "# Home", "utf8");
    await writeFile(join(root, "ignore.txt"), "not Markdown", "utf8");
    await writeFile(join(root, "Guides", "Café notes.markdown"), "# Café", "utf8");
    const service = new CollectionService();

    const snapshot = await service.openFolder(root);

    expect(snapshot.documentCount).toBe(2);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: "README.md", kind: "document", depth: 1 }),
      expect.objectContaining({ relativePath: "Guides", kind: "folder", depth: 1 }),
      expect.objectContaining({ relativePath: "Guides/Café notes.markdown", kind: "document", depth: 2 }),
    ]));
    expect(snapshot.entries.some((entry) => entry.name === "ignore.txt")).toBe(false);
    await expect(service.resolveDocument(snapshot.id, "Guides/Café notes.markdown"))
      .resolves.toBe(join(root, "Guides", "Café notes.markdown"));
    await expect(service.resolveDocument(snapshot.id, "ignore.txt"))
      .rejects.toThrow("Markdown document");
  });

  it("returns flat tree entries in depth-first pre-order", async () => {
    await mkdir(join(root, "Alpha"));
    await mkdir(join(root, "Beta"));
    await writeFile(join(root, "Alpha", "alpha-child.md"), "# Alpha", "utf8");
    await writeFile(join(root, "Beta", "beta-child.md"), "# Beta", "utf8");

    const snapshot = await new CollectionService().openFolder(root);

    expect(snapshot.entries.map((entry) => entry.relativePath)).toEqual([
      "Alpha",
      "Alpha/alpha-child.md",
      "Beta",
      "Beta/beta-child.md",
    ]);
  });

  it("rejects traversal, absolute paths, separators and unsupported extensions", () => {
    for (const path of ["../secret.md", "/absolute.md", "C:/absolute.md", "folder\\note.md", "./note.md", "folder//note.md"]) {
      expect(folderRelativePathSchema.safeParse(path).success, path).toBe(false);
    }
  });

  it("skips symbolic links and rejects a canonical symlink escape", async () => {
    await writeFile(join(outside, "secret.md"), "# Secret", "utf8");
    const linkPath = join(root, "escape");
    await symlink(outside, linkPath, process.platform === "win32" ? "junction" : "dir");
    const service = new CollectionService();

    const snapshot = await service.openFolder(root);

    expect(snapshot.entries.some((entry) => entry.relativePath.startsWith("escape"))).toBe(false);
    await expect(service.resolveDocument(snapshot.id, "escape/secret.md"))
      .rejects.toThrow("outside the open folder");
  });

  it("rejects a root that is replaced by a junction outside the granted folder", async () => {
    await writeFile(join(root, "safe.md"), "# Safe", "utf8");
    await writeFile(join(outside, "secret.md"), "# Secret", "utf8");
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);
    const originalRoot = `${root}-original`;

    await rename(root, originalRoot);
    try {
      await symlink(outside, root, process.platform === "win32" ? "junction" : "dir");
      await expect(service.getSnapshot(snapshot.id)).rejects.toThrow("outside the open folder");
      await expect(service.resolveDocument(snapshot.id, "secret.md")).rejects.toThrow("outside the open folder");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rename(originalRoot, root);
    }
  });

  it("skips a child directory replaced by an escaping junction after the grant", async () => {
    const guides = join(root, "Guides");
    await mkdir(guides);
    await writeFile(join(guides, "safe.md"), "# Safe", "utf8");
    await writeFile(join(outside, "secret.md"), "# Secret", "utf8");
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);

    await rm(guides, { recursive: true, force: true });
    await symlink(outside, guides, process.platform === "win32" ? "junction" : "dir");

    const refreshed = await service.getSnapshot(snapshot.id);
    expect(refreshed.entries.some((entry) => entry.relativePath.startsWith("Guides"))).toBe(false);
    await expect(service.resolveDocument(snapshot.id, "Guides/secret.md"))
      .rejects.toThrow("outside the open folder");
  });

  it("caps deep directory traversal and marks the snapshot truncated", async () => {
    let directory = root;
    for (let depth = 1; depth <= MAX_FOLDER_DEPTH + 2; depth += 1) {
      directory = join(directory, `d${String(depth).padStart(2, "0")}`);
      await mkdir(directory);
      await writeFile(join(directory, `depth-${depth}.md`), `# ${depth}`, "utf8");
    }
    const snapshot = await new CollectionService().openFolder(root);

    expect(snapshot.truncated).toBe(true);
    expect(Math.max(...snapshot.entries.map((entry) => entry.depth))).toBe(MAX_FOLDER_DEPTH);
    expect(snapshot.entries.some((entry) => entry.relativePath.includes(`d${MAX_FOLDER_DEPTH + 1}`))).toBe(false);
  });

  it("caps very large folders at the documented Markdown-file limit", async () => {
    await writeFiles(root, MAX_FOLDER_DOCUMENTS + 1);

    const snapshot = await new CollectionService().openFolder(root);

    expect(snapshot.documentCount).toBe(MAX_FOLDER_DOCUMENTS);
    expect(snapshot.entries).toHaveLength(MAX_FOLDER_DOCUMENTS);
    expect(snapshot.truncated).toBe(true);
  }, 30_000);

  it("invalidates grants when a folder closes", async () => {
    await writeFile(join(root, "note.md"), "# Note", "utf8");
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);
    service.closeFolder(snapshot.id);

    await expect(service.getSnapshot(snapshot.id)).rejects.toThrow("Open this folder again");
    await expect(service.resolveDocument(snapshot.id, "note.md")).rejects.toThrow("Open this folder again");
  });

  it("skips oversized documents during folder search", async () => {
    const oversized = join(root, "oversized.md");
    await writeFile(oversized, "match", "utf8");
    await truncate(oversized, MAX_DOCUMENT_BYTES + 1);
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);

    const response = await service.searchFolder({
      requestId: randomUUID(),
      folderId: snapshot.id,
      query: "match",
      matchCase: false,
      wholeWord: false,
    });

    expect(response.results).toEqual([]);
    expect(response.skippedFiles).toBe(1);
    expect(response.scannedFiles).toBe(0);
  });
});

describe.sequential("CollectionService search", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "chwezi-search-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns deterministic Unicode results with line, column and snippets", async () => {
    await writeFile(join(root, "Luganda.md"), "# Okunoonya\n\nEbigambo eby'omu kitabo.\n", "utf8");
    await writeFile(join(root, "日本語.md"), "始まり\n検索する言葉\n終わり", "utf8");
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);

    const response = await service.searchFolder({
      requestId: randomUUID(),
      folderId: snapshot.id,
      query: "検索",
      matchCase: false,
      wholeWord: false,
    });

    expect(response).toMatchObject({ cancelled: false, truncated: false, scannedFiles: 2, skippedFiles: 0 });
    expect(response.results).toEqual([expect.objectContaining({
      relativePath: "日本語.md",
      name: "日本語.md",
      line: 2,
      column: 1,
      snippet: "検索する言葉",
    })]);
  });

  it("honours match-case and Unicode whole-word options", async () => {
    await writeFile(join(root, "words.md"), "Reader reader readership\nCAFÉ café cafétéria", "utf8");
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);
    const search = (query: string, matchCase: boolean, wholeWord: boolean) => service.searchFolder({
      requestId: randomUUID(), folderId: snapshot.id, query, matchCase, wholeWord,
    });

    await expect(search("Reader", true, true)).resolves.toMatchObject({ results: [expect.objectContaining({ column: 1 })] });
    await expect(search("reader", false, true)).resolves.toMatchObject({ results: expect.arrayContaining([
      expect.objectContaining({ column: 1 }), expect.objectContaining({ column: 8 }),
    ]) });
    expect((await search("café", false, true)).results).toHaveLength(2);
  });

  it("caps result volume and reports truncation", async () => {
    await writeFile(
      join(root, "many.md"),
      Array.from({ length: MAX_FOLDER_SEARCH_RESULTS + 25 }, (_, index) => `line ${index}: needle`).join("\n"),
      "utf8",
    );
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);

    const response = await service.searchFolder({
      requestId: randomUUID(), folderId: snapshot.id, query: "needle", matchCase: false, wholeWord: false,
    });

    expect(response.results).toHaveLength(MAX_FOLDER_SEARCH_RESULTS);
    expect(response.truncated).toBe(true);
    expect(response.cancelled).toBe(false);
  });

  it("cancels an in-flight search and rejects duplicate request identifiers", async () => {
    await writeFiles(root, 250);
    const service = new CollectionService();
    const snapshot = await service.openFolder(root);
    const requestId = randomUUID();
    const request = { requestId, folderId: snapshot.id, query: "Note", matchCase: false, wholeWord: false };

    const firstSearch = service.searchFolder(request);
    await expect(service.searchFolder(request)).rejects.toThrow("already running");
    expect(service.cancelSearch(requestId)).toBe(true);
    await expect(firstSearch).resolves.toMatchObject({ requestId, cancelled: true });
    expect(service.cancelSearch(requestId)).toBe(false);
  });
});
