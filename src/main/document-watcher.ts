import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { DocumentState } from "./ipc-contracts";

const CHANGE_DEBOUNCE_MS = 180;
const WATCH_RETRY_MIN_MS = 250;
const WATCH_RETRY_MAX_MS = 5_000;

export class DocumentWatcher {
  private watcher: FSWatcher | null = null;
  private watchedPath: string | null = null;
  private generation = 0;
  private debounceTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDelay = WATCH_RETRY_MIN_MS;
  private fileWasMissing = false;

  public constructor(private readonly emitState: (state: DocumentState) => void) {}

  public watch(filePath: string): void {
    if (this.watchedPath === filePath && this.watcher !== null) {
      return;
    }

    this.stopCurrentGeneration();
    this.watchedPath = filePath;
    this.fileWasMissing = false;
    this.retryDelay = WATCH_RETRY_MIN_MS;
    const generation = this.generation;
    this.attach(generation);
  }

  public close(): void {
    this.stopCurrentGeneration();
    this.watchedPath = null;
  }

  private stopCurrentGeneration(): void {
    this.generation += 1;
    this.watcher?.close();
    this.watcher = null;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private attach(generation: number): void {
    const filePath = this.watchedPath;
    if (filePath === null || generation !== this.generation) {
      return;
    }

    const parentDirectory = dirname(filePath);
    const watchedName = basename(filePath);
    try {
      const nextWatcher = watch(parentDirectory, (_eventType, changedName) => {
        if (generation !== this.generation) {
          return;
        }
        const name = changedName === null ? null : changedName.toString();
        if (name === null || this.sameFilename(name, watchedName)) {
          this.scheduleInspection(generation);
        }
      });
      nextWatcher.on("error", () => this.handleWatcherFailure(generation));
      this.watcher = nextWatcher;
      this.retryDelay = WATCH_RETRY_MIN_MS;
    } catch {
      this.scheduleReattach(generation);
    }
  }

  private sameFilename(left: string, right: string): boolean {
    return process.platform === "win32"
      ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
      : left === right;
  }

  private handleWatcherFailure(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.watcher?.close();
    this.watcher = null;
    this.scheduleInspection(generation);
    this.scheduleReattach(generation);
  }

  private scheduleReattach(generation: number): void {
    if (generation !== this.generation || this.retryTimer !== null) {
      return;
    }
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, WATCH_RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attach(generation);
      if (this.watcher === null) {
        this.scheduleReattach(generation);
      }
    }, delay);
  }

  private scheduleInspection(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.inspect(generation);
    }, CHANGE_DEBOUNCE_MS);
  }

  private async inspect(generation: number): Promise<void> {
    const filePath = this.watchedPath;
    if (filePath === null || generation !== this.generation) {
      return;
    }

    try {
      const fileStats = await stat(filePath);
      if (generation !== this.generation) {
        return;
      }
      if (!fileStats.isFile()) {
        this.reportMissing(filePath);
        return;
      }
      const state = this.fileWasMissing ? "restored" : "changed";
      this.fileWasMissing = false;
      this.emitState({ path: filePath, state });
    } catch (error: unknown) {
      if (generation !== this.generation) {
        return;
      }
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (code === "ENOENT" || code === "ENOTDIR") {
        this.reportMissing(filePath);
        return;
      }
      // Permission and transient I/O failures are surfaced through a normal reload.
      // That keeps the watcher alive so a later save can recover without reopening.
      this.emitState({ path: filePath, state: "changed" });
    }
  }

  private reportMissing(filePath: string): void {
    if (this.fileWasMissing) {
      return;
    }
    this.fileWasMissing = true;
    this.emitState({ path: filePath, state: "missing" });
  }
}
