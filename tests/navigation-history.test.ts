// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NavigationHistory } from "../src/renderer/navigation-history";

interface Snapshot { readonly scrollRatio: number }

describe("NavigationHistory", () => {
  it("moves backward and forward while retaining per-document state and fragments", () => {
    const history = new NavigationHistory<string, Snapshot>();
    history.push("one.md");
    history.saveCurrentState({ scrollRatio: 0.4 });
    history.push("two.md", "details");

    expect(history.canGoBack).toBe(true);
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toEqual({ document: "one.md", state: { scrollRatio: 0.4 }, fragment: null });
    expect(history.forward()).toEqual({ document: "two.md", state: null, fragment: "details" });
  });

  it("truncates forward history when a new document opens after going back", () => {
    const history = new NavigationHistory<string, Snapshot>();
    history.push("one.md");
    history.push("two.md");
    history.push("three.md");
    history.back();
    history.push("replacement.md");

    expect(history.current?.document).toBe("replacement.md");
    expect(history.canGoForward).toBe(false);
    expect(history.forward()).toBeNull();
  });

  it("undoes a failed back or forward navigation without corrupting position", () => {
    const history = new NavigationHistory<string, Snapshot>();
    history.push("one.md");
    history.push("two.md");

    expect(history.back()?.document).toBe("one.md");
    history.undoBack();
    expect(history.current?.document).toBe("two.md");
    expect(history.back()?.document).toBe("one.md");
    expect(history.forward()?.document).toBe("two.md");
    history.undoForward();
    expect(history.current?.document).toBe("one.md");
  });

  it("enforces the configured history limit and keeps the newest entries", () => {
    const history = new NavigationHistory<number, Snapshot>(3);
    history.push(1);
    history.push(2);
    history.push(3);
    history.push(4);

    expect(history.back()?.document).toBe(3);
    expect(history.back()?.document).toBe(2);
    expect(history.back()).toBeNull();
  });
});
