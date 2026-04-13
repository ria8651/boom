export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Check if two rectangles overlap, with an optional minimum gap.
 */
export function rectsOverlap(a: Rect, b: Rect, minGap = 0): boolean {
  return (
    a.x < b.x + b.w + minGap &&
    a.x + a.w + minGap > b.x &&
    a.y < b.y + b.h + minGap &&
    a.y + a.h + minGap > b.y
  );
}

export interface SweepResult {
  t: number; // time of contact, 0..1 (1 = no collision in this step)
  normalX: number; // collision normal (-1, 0, or 1)
  normalY: number;
}

/**
 * Swept AABB collision: find the earliest time `t` in [0,1] at which
 * rect `a` moving by (dx, dy) first contacts rect `b` (with gap).
 *
 * Returns t=1 if no collision occurs during the sweep.
 * On collision, normalX/normalY indicate which face was hit.
 */
export function sweepAABB(
  a: Rect,
  b: Rect,
  dx: number,
  dy: number,
  gap: number,
): SweepResult {
  const NO_HIT: SweepResult = { t: 1, normalX: 0, normalY: 0 };

  // Expand b by a's size + gap (Minkowski sum)
  const ex = b.x - a.w - gap;
  const ey = b.y - a.h - gap;
  const ew = b.w + a.w + gap * 2;
  const eh = b.h + a.h + gap * 2;

  // Ray from a's top-left corner along (dx, dy) vs expanded rect
  // Find entry and exit times on each axis
  let txEntry: number, txExit: number;
  let tyEntry: number, tyExit: number;

  if (dx === 0) {
    // Not moving on X — check if already within X range
    if (a.x < ex || a.x >= ex + ew) return NO_HIT;
    txEntry = -Infinity;
    txExit = Infinity;
  } else {
    txEntry = (dx > 0 ? ex - a.x : ex + ew - a.x) / dx;
    txExit = (dx > 0 ? ex + ew - a.x : ex - a.x) / dx;
  }

  if (dy === 0) {
    if (a.y < ey || a.y >= ey + eh) return NO_HIT;
    tyEntry = -Infinity;
    tyExit = Infinity;
  } else {
    tyEntry = (dy > 0 ? ey - a.y : ey + eh - a.y) / dy;
    tyExit = (dy > 0 ? ey + eh - a.y : ey - a.y) / dy;
  }

  const tEntry = Math.max(txEntry, tyEntry);
  const tExit = Math.min(txExit, tyExit);

  // No collision if entry after exit, or entry beyond this step
  if (tEntry > tExit || tEntry >= 1) return NO_HIT;

  // If tEntry < 0 but tExit > 0, the mover is already inside the gap zone
  // (touching or overlapping). Block movement by returning t=0.
  // The txEntry/tyEntry comparison still gives the correct normal — the less
  // negative value is the axis that was crossed more recently.
  if (tEntry < 0) {
    if (tExit <= 0) return NO_HIT; // fully behind, separating
    let normalX = 0, normalY = 0;
    if (txEntry > tyEntry) {
      normalX = dx > 0 ? -1 : 1;
    } else {
      normalY = dy > 0 ? -1 : 1;
    }
    return { t: 0, normalX, normalY };
  }

  // Determine which axis was hit (the one with the later entry time)
  let normalX = 0, normalY = 0;
  if (txEntry > tyEntry) {
    normalX = dx > 0 ? -1 : 1;
  } else {
    normalY = dy > 0 ? -1 : 1;
  }

  return { t: tEntry, normalX, normalY };
}

/**
 * Compute the minimum translation vector to separate two rects.
 * Used only as fallback for initially-overlapping tiles.
 */
export function computeMTV(
  a: Rect,
  b: Rect,
  gap: number,
): { dx: number; dy: number } | null {
  const overlapX =
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gap;
  const overlapY =
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gap;

  if (overlapX <= 0 || overlapY <= 0) return null;

  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;

  if (overlapX < overlapY) {
    return { dx: acx < bcx ? -overlapX : overlapX, dy: 0 };
  } else {
    return { dx: 0, dy: acy < bcy ? -overlapY : overlapY };
  }
}

/**
 * Compute axis-aligned bounding box of a set of rects.
 */
export function boundingBox(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
