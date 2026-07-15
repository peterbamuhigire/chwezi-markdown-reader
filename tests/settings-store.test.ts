// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_READER_SETTINGS,
  MAX_RECENT_FILES,
  migrateSettings,
  SettingsStore,
} from "../src/main/settings-store";

describe.sequential("SettingsStore", () => {
  let directory = "";
  let settingsPath = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-settings-"));
    settingsPath = join(directory, "nested", "settings.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("loads safe defaults from a missing, corrupt, or unsupported settings file", async () => {
    const store = new SettingsStore(settingsPath);
    await store.load();
    expect(store.getReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);

    await mkdir(join(directory, "nested"));
    await writeFile(settingsPath, "not JSON", "utf8");
    await store.load();
    expect(store.getReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);

    await writeFile(settingsPath, JSON.stringify({ version: 99, reader: { fontSize: 100 } }), "utf8");
    await store.load();
    expect(store.getReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);
  });

  it("migrates legacy partial settings and rejects invalid legacy values", () => {
    expect(migrateSettings({ reader: { fontSize: 20 }, unknownLegacyKey: true }).reader).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 20,
    });
    expect(migrateSettings({ reader: { fontSize: 200 } }).reader).toEqual(DEFAULT_READER_SETTINGS);
  });

  it("persists partial reader updates atomically and reloads them", async () => {
    const store = new SettingsStore(settingsPath);
    await store.load();
    await store.updateReaderSettings({ fontFamily: "sans", fontSize: 20, reopenLastDocument: true });
    await store.flush();

    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as { version: number; reader: unknown };
    expect(persisted.version).toBe(1);
    expect(persisted.reader).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontFamily: "sans",
      fontSize: 20,
      reopenLastDocument: true,
    });
    expect((await readFile(settingsPath, "utf8")).endsWith("\n")).toBe(true);

    const reloaded = new SettingsStore(settingsPath);
    await reloaded.load();
    expect(reloaded.getReaderSettings()).toEqual(persisted.reader);
  });

  it("deduplicates, orders, caps, and prunes recent files", async () => {
    const store = new SettingsStore(settingsPath);
    await store.load();
    const paths = await Promise.all(Array.from({ length: MAX_RECENT_FILES + 1 }, async (_, index) => {
      const filePath = join(directory, `note-${String(index).padStart(2, "0")}.md`);
      await writeFile(filePath, `# ${index}`, "utf8");
      return filePath;
    }));
    for (const filePath of paths) {
      await store.recordDocumentOpened(filePath);
    }
    await store.recordDocumentOpened(paths[5]);

    const recent = await store.getRecentFiles(false);
    expect(recent).toHaveLength(MAX_RECENT_FILES);
    expect(recent[0]?.path).toBe(paths[5]);
    expect(new Set(recent.map((entry) => entry.path)).size).toBe(MAX_RECENT_FILES);

    await store.updateReaderSettings({ reopenLastDocument: true });
    await unlink(paths[5]);
    const pruned = await store.getRecentFiles(true);
    expect(pruned.some((entry) => entry.path === paths[5])).toBe(false);
    expect(store.getLastDocumentPath()).toBeNull();
  });

  it("reopens the last document only after explicit opt-in", async () => {
    const filePath = join(directory, "last.md");
    await writeFile(filePath, "# Last", "utf8");
    const store = new SettingsStore(settingsPath);
    await store.load();
    await store.recordDocumentOpened(filePath);
    expect(store.getLastDocumentPath()).toBeNull();

    await store.updateReaderSettings({ reopenLastDocument: true });
    expect(store.getLastDocumentPath()).toBe(filePath);
  });

  it("stores reading and window state, then clears document history without resetting appearance", async () => {
    const filePath = join(directory, "reading.md");
    await writeFile(filePath, "# Reading", "utf8");
    const store = new SettingsStore(settingsPath);
    await store.load();
    await store.updateReaderSettings({ fontSize: 19 });
    await store.recordDocumentOpened(filePath);
    await store.setReadingState(filePath, { headingId: "chapter", headingOffset: 24, scrollRatio: 0.42 });
    await store.setWindowState({ bounds: { x: 20, y: 30, width: 1_200, height: 800 }, maximized: true });

    expect(store.getReadingState(filePath)).toEqual({ headingId: "chapter", headingOffset: 24, scrollRatio: 0.42 });
    expect(store.getWindowState()).toEqual({ bounds: { x: 20, y: 30, width: 1_200, height: 800 }, maximized: true });

    await store.clearHistory();
    expect(await store.getRecentFiles(false)).toEqual([]);
    expect(store.getReadingState(filePath)).toBeNull();
    expect(store.getReaderSettings().fontSize).toBe(19);
    expect(store.getWindowState()?.maximized).toBe(true);
  });
});
