// @vitest-environment node

import { describe, expect, it } from "vitest";
import { recoverWindowBounds } from "../src/main/window-state";

const workArea = { x: 0, y: 0, width: 1_920, height: 1_040 };

describe("window-state recovery", () => {
  it("returns null without a saved state or available display", () => {
    expect(recoverWindowBounds(null, [workArea])).toBeNull();
    expect(recoverWindowBounds({ bounds: { x: 0, y: 0, width: 1_200, height: 800 }, maximized: false }, [])).toBeNull();
  });

  it("preserves an on-screen window", () => {
    expect(recoverWindowBounds({ bounds: { x: 100, y: 80, width: 1_200, height: 800 }, maximized: false }, [workArea])).toEqual({
      x: 100,
      y: 80,
      width: 1_200,
      height: 800,
    });
  });

  it("clamps a partially off-screen or oversized window into the best display", () => {
    expect(recoverWindowBounds({ bounds: { x: 1_700, y: 900, width: 2_400, height: 1_400 }, maximized: false }, [workArea])).toEqual({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_040,
    });
  });

  it("rejects a window that only belongs to a disconnected display", () => {
    expect(recoverWindowBounds({ bounds: { x: 5_000, y: 100, width: 1_200, height: 800 }, maximized: false }, [workArea])).toBeNull();
  });

  it("selects the display with the greatest visible overlap", () => {
    const second = { x: 1_920, y: 0, width: 2_560, height: 1_400 };
    expect(recoverWindowBounds({ bounds: { x: 1_800, y: 100, width: 1_200, height: 800 }, maximized: false }, [workArea, second])).toEqual({
      x: 1_920,
      y: 100,
      width: 1_200,
      height: 800,
    });
  });
});
