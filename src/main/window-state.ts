import type { Rectangle } from "electron";
import type { StoredWindowState } from "./settings-store";

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

export function recoverWindowBounds(
  savedState: StoredWindowState | null,
  workAreas: readonly Rectangle[],
): Rectangle | null {
  if (savedState === null || workAreas.length === 0) {
    return null;
  }

  const bestArea = workAreas.reduce<{ area: Rectangle; overlap: number } | null>((best, area) => {
    const overlap = intersectionArea(savedState.bounds, area);
    return best === null || overlap > best.overlap ? { area, overlap } : best;
  }, null);
  if (bestArea === null || bestArea.overlap < 64 * 64) {
    return null;
  }

  const width = Math.min(savedState.bounds.width, bestArea.area.width);
  const height = Math.min(savedState.bounds.height, bestArea.area.height);
  return {
    x: Math.min(Math.max(savedState.bounds.x, bestArea.area.x), bestArea.area.x + bestArea.area.width - width),
    y: Math.min(Math.max(savedState.bounds.y, bestArea.area.y), bestArea.area.y + bestArea.area.height - height),
    width,
    height,
  };
}
