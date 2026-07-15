// @vitest-environment node

import { mkdtemp, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DocumentWatcher } from "../src/main/document-watcher";
import type { DocumentState } from "../src/main/ipc-contracts";

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Watcher state did not arrive within ${timeoutMs} ms.`);
    }
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

describe.sequential("DocumentWatcher filesystem integration", () => {
  let directory = "";
  let watcher: DocumentWatcher | null = null;
  let states: DocumentState[] = [];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "chwezi-watcher-"));
    states = [];
    watcher = new DocumentWatcher((state) => states.push(state));
  });

  afterEach(async () => {
    watcher?.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("reports a direct write to the active document", async () => {
    const filePath = join(directory, "notes.md");
    await writeFile(filePath, "before", "utf8");
    watcher?.watch(filePath);

    await writeFile(filePath, "after", "utf8");
    await waitFor(() => states.some((state) => state.state === "changed"));

    expect(states.at(-1)).toEqual({ path: filePath, state: "changed" });
  });

  it("continues across a temporary-file replacement", async () => {
    const filePath = join(directory, "atomic.md");
    const replacementPath = join(directory, "atomic.md.tmp");
    await writeFile(filePath, "before", "utf8");
    watcher?.watch(filePath);

    await writeFile(replacementPath, "after", "utf8");
    if (process.platform === "win32") {
      await unlink(filePath);
    }
    await rename(replacementPath, filePath);
    await waitFor(() => states.some((state) => state.path === filePath));

    expect(states.at(-1)?.state).toMatch(/^(changed|restored)$/);
  });

  it("reports deletion once and recovery when the same path returns", async () => {
    const filePath = join(directory, "recover.md");
    await writeFile(filePath, "before", "utf8");
    watcher?.watch(filePath);

    await unlink(filePath);
    await waitFor(() => states.some((state) => state.state === "missing"));
    await writeFile(filePath, "restored", "utf8");
    await waitFor(() => states.some((state) => state.state === "restored"));

    expect(states.filter((state) => state.state === "missing")).toHaveLength(1);
    expect(states.at(-1)).toEqual({ path: filePath, state: "restored" });
  });

  it("cancels an old document debounce when the active path changes", async () => {
    const firstPath = join(directory, "first.md");
    const secondPath = join(directory, "second.md");
    await writeFile(firstPath, "first", "utf8");
    await writeFile(secondPath, "second", "utf8");
    watcher?.watch(firstPath);

    await writeFile(firstPath, "changed first", "utf8");
    watcher?.watch(secondPath);
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 350));
    expect(states).toEqual([]);

    await writeFile(secondPath, "changed second", "utf8");
    await waitFor(() => states.some((state) => state.path === secondPath));
    expect(states.every((state) => state.path === secondPath)).toBe(true);
  });

  it("coalesces a burst of writes into one reload signal", async () => {
    const filePath = join(directory, "rapid.md");
    await writeFile(filePath, "0", "utf8");
    watcher?.watch(filePath);

    await Promise.all(Array.from({ length: 20 }, (_, index) => writeFile(filePath, String(index), "utf8")));
    await waitFor(() => states.length > 0);
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 350));

    expect(states).toEqual([{ path: filePath, state: "changed" }]);
  });
});
