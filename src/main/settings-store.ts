import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import {
  filePathSchema,
  readerSettingsPatchSchema,
  readerSettingsSchema,
  readingStateSchema,
  recentFileSchema,
  type ReaderSettings,
  type ReaderSettingsPatch,
  type ReadingState,
  type RecentFile,
} from "./ipc-contracts";

export const SETTINGS_VERSION = 1;
export const MAX_RECENT_FILES = 12;
const MAX_READING_STATES = 200;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: "serif",
  fontSize: 17,
  lineHeight: 1.72,
  readingWidth: 820,
  paragraphSpacing: 1.12,
  reopenLastDocument: false,
};

const windowBoundsSchema = z.object({
  x: z.number().int().min(-1_000_000).max(1_000_000),
  y: z.number().int().min(-1_000_000).max(1_000_000),
  width: z.number().int().min(720).max(10_000),
  height: z.number().int().min(520).max(10_000),
}).strict();

const windowStateSchema = z.object({
  bounds: windowBoundsSchema,
  maximized: z.boolean(),
}).strict();

const storedReadingStateSchema = z.object({
  path: filePathSchema,
  state: readingStateSchema,
  updatedAt: z.number().int().nonnegative(),
}).strict();

const storedSettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  reader: readerSettingsSchema,
  recentFiles: z.array(recentFileSchema).max(MAX_RECENT_FILES),
  lastDocumentPath: filePathSchema.nullable(),
  window: windowStateSchema.nullable(),
  readingStates: z.array(storedReadingStateSchema).max(MAX_READING_STATES),
}).strict();

type StoredSettings = z.infer<typeof storedSettingsSchema>;
export type StoredWindowState = z.infer<typeof windowStateSchema>;

function defaultStoredSettings(): StoredSettings {
  return {
    version: SETTINGS_VERSION,
    reader: { ...DEFAULT_READER_SETTINGS },
    recentFiles: [],
    lastDocumentPath: null,
    window: null,
    readingStates: [],
  };
}

function pathKey(filePath: string): string {
  const absolutePath = resolve(filePath);
  return process.platform === "win32" ? absolutePath.toLocaleLowerCase() : absolutePath;
}

const legacySettingsSchema = z.object({
  reader: readerSettingsSchema.partial().optional(),
  recentFiles: z.array(recentFileSchema).optional(),
  lastDocumentPath: filePathSchema.nullable().optional(),
  window: windowStateSchema.nullable().optional(),
  readingStates: z.array(storedReadingStateSchema).optional(),
}).passthrough();

export function migrateSettings(value: unknown): StoredSettings {
  const current = storedSettingsSchema.safeParse(value);
  if (current.success) {
    return current.data;
  }

  const legacy = legacySettingsSchema.safeParse(value);
  if (!legacy.success || (typeof value === "object" && value !== null && "version" in value)) {
    return defaultStoredSettings();
  }

  return storedSettingsSchema.parse({
    ...defaultStoredSettings(),
    reader: { ...DEFAULT_READER_SETTINGS, ...legacy.data.reader },
    recentFiles: (legacy.data.recentFiles ?? []).slice(0, MAX_RECENT_FILES),
    lastDocumentPath: legacy.data.lastDocumentPath ?? null,
    window: legacy.data.window ?? null,
    readingStates: (legacy.data.readingStates ?? []).slice(0, MAX_READING_STATES),
  });
}

export class SettingsStore {
  private state: StoredSettings = defaultStoredSettings();
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<void> {
    try {
      this.state = migrateSettings(JSON.parse(await readFile(this.filePath, "utf8")) as unknown);
    } catch {
      this.state = defaultStoredSettings();
    }
  }

  public getReaderSettings(): ReaderSettings {
    return { ...this.state.reader };
  }

  public async updateReaderSettings(untrustedPatch: unknown): Promise<ReaderSettings> {
    const patch = readerSettingsPatchSchema.parse(untrustedPatch) as ReaderSettingsPatch;
    this.state.reader = readerSettingsSchema.parse({ ...this.state.reader, ...patch });
    await this.persist();
    return this.getReaderSettings();
  }

  public async recordDocumentOpened(untrustedPath: unknown): Promise<void> {
    const filePath = resolve(filePathSchema.parse(untrustedPath));
    const key = pathKey(filePath);
    this.state.recentFiles = [
      { path: filePath, name: basename(filePath), lastOpenedAt: Date.now() },
      ...this.state.recentFiles.filter((entry) => pathKey(entry.path) !== key),
    ].slice(0, MAX_RECENT_FILES);
    this.state.lastDocumentPath = filePath;
    await this.persist();
  }

  public async getRecentFiles(pruneMissing = true): Promise<RecentFile[]> {
    if (pruneMissing) {
      const checked = await Promise.all(this.state.recentFiles.map(async (entry) => {
        try {
          return (await stat(entry.path)).isFile() ? entry : null;
        } catch {
          return null;
        }
      }));
      const existing = checked.filter((entry): entry is RecentFile => entry !== null);
      if (existing.length !== this.state.recentFiles.length) {
        this.state.recentFiles = existing;
        if (
          this.state.lastDocumentPath !== null
          && !existing.some((entry) => pathKey(entry.path) === pathKey(this.state.lastDocumentPath ?? ""))
        ) {
          this.state.lastDocumentPath = null;
        }
        try {
          await this.persist();
        } catch {
          // Pruning is housekeeping. Return the verified in-memory list even if
          // app data is temporarily read-only; explicit setting writes still fail.
        }
      }
    }
    return this.state.recentFiles.map((entry) => ({ ...entry }));
  }

  public hasRecentFile(untrustedPath: unknown): boolean {
    const key = pathKey(filePathSchema.parse(untrustedPath));
    return this.state.recentFiles.some((entry) => pathKey(entry.path) === key);
  }

  public async clearHistory(): Promise<void> {
    this.state.recentFiles = [];
    this.state.lastDocumentPath = null;
    this.state.readingStates = [];
    await this.persist();
  }

  public getLastDocumentPath(): string | null {
    return this.state.reader.reopenLastDocument ? this.state.lastDocumentPath : null;
  }

  public getWindowState(): StoredWindowState | null {
    return this.state.window === null
      ? null
      : { bounds: { ...this.state.window.bounds }, maximized: this.state.window.maximized };
  }

  public async setWindowState(untrustedState: unknown): Promise<void> {
    this.state.window = windowStateSchema.parse(untrustedState);
    await this.persist();
  }

  public getReadingState(untrustedPath: unknown): ReadingState | null {
    const key = pathKey(filePathSchema.parse(untrustedPath));
    const entry = this.state.readingStates.find((candidate) => pathKey(candidate.path) === key);
    return entry === undefined ? null : { ...entry.state };
  }

  public async setReadingState(untrustedPath: unknown, untrustedState: unknown): Promise<void> {
    const filePath = resolve(filePathSchema.parse(untrustedPath));
    const state = readingStateSchema.parse(untrustedState);
    const key = pathKey(filePath);
    this.state.readingStates = [
      { path: filePath, state, updatedAt: Date.now() },
      ...this.state.readingStates.filter((entry) => pathKey(entry.path) !== key),
    ].slice(0, MAX_READING_STATES);
    await this.persist();
  }

  public async flush(): Promise<void> {
    await this.writeChain;
  }

  private async persist(): Promise<void> {
    const contents = `${JSON.stringify(this.state, null, 2)}\n`;
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    await this.writeChain;
  }
}
