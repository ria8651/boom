import type {
  TileInput,
  TileLayout,
  LayoutOptions,
  PackResult,
  SimFrame,
} from "./types.js";
import { sweepAABB, computeMTV, boundingBox, type Rect } from "./geometry.js";

const SIM_ITERATIONS = 150;
const K_GRAVITY = 0.08;
const K_ASPECT = 0; // disabled — tune via debug page
const DAMPING = 0.8;
const EARLY_STOP_THRESHOLD = 0.1;

interface SimTile {
  key: string;
  rect: Rect;
  vx: number;
  vy: number;
}

function tileSize(
  aspect: number,
  baseHeight: number,
  labelH: number,
  scaleOverride = 1,
): { w: number; h: number } {
  const h = baseHeight * scaleOverride;
  const w = h * aspect;
  return { w, h: h + labelH };
}

function chooseBaseHeight(
  tiles: TileInput[],
  containerW: number,
  containerH: number,
  labelH: number,
): number {
  if (tiles.length === 0) return 0;
  const containerArea = containerW * containerH;
  const targetArea = containerArea * 0.9;
  const avgAspect =
    tiles.reduce((s, t) => s + (t.scaleOverride ?? 1) * t.aspect, 0) / tiles.length;
  const h = Math.sqrt(targetArea / (tiles.length * avgAspect));
  return Math.max(40, Math.min(h, containerH - labelH));
}

function dropAngle(index: number): number {
  return index * 2.399963;
}

function snapshotFrame(simTiles: SimTile[]): SimFrame {
  return {
    tiles: simTiles.map((t) => ({
      key: t.key,
      x: t.rect.x,
      y: t.rect.y,
      w: t.rect.w,
      h: t.rect.h,
    })),
  };
}

/**
 * Resolve any existing overlaps (from initial placement) by pushing tiles apart.
 */
function resolveInitialOverlaps(simTiles: SimTile[], gap: number): void {
  for (let pass = 0; pass < 50; pass++) {
    let hadOverlap = false;
    for (let i = 0; i < simTiles.length; i++) {
      for (let j = i + 1; j < simTiles.length; j++) {
        const mtv = computeMTV(simTiles[i].rect, simTiles[j].rect, gap);
        if (mtv) {
          hadOverlap = true;
          simTiles[i].rect.x += mtv.dx * 0.5;
          simTiles[i].rect.y += mtv.dy * 0.5;
          simTiles[j].rect.x -= mtv.dx * 0.5;
          simTiles[j].rect.y -= mtv.dy * 0.5;
        }
      }
    }
    if (!hadOverlap) break;
  }
}

/**
 * Swept collision simulation. Instead of move-then-push, each tile is moved
 * along its velocity and stopped at the exact contact point with other tiles.
 */
function simulate(
  simTiles: SimTile[],
  cx: number,
  cy: number,
  containerAspect: number,
  gap: number,
  iterations: number,
  debugFrames?: SimFrame[],
): void {
  for (let iter = 0; iter < iterations; iter++) {
    let maxDisplacement = 0;

    const fx = new Float64Array(simTiles.length);
    const fy = new Float64Array(simTiles.length);

    // 1. Center gravity
    for (let i = 0; i < simTiles.length; i++) {
      const t = simTiles[i];
      const tcx = t.rect.x + t.rect.w / 2;
      const tcy = t.rect.y + t.rect.h / 2;
      fx[i] += K_GRAVITY * (cx - tcx);
      fy[i] += K_GRAVITY * (cy - tcy);
    }

    // 2. Aspect ratio matching — only compress the long axis, don't spread the short axis.
    //    The sweep's slide behavior handles spreading naturally.
    if (simTiles.length > 1) {
      const rects = simTiles.map((t) => t.rect);
      const bb = boundingBox(rects);
      if (bb.w > 0 && bb.h > 0) {
        const bbAspect = bb.w / bb.h;
        if (bbAspect > containerAspect * 1.2) {
          // Too wide: compress horizontally only
          for (let i = 0; i < simTiles.length; i++) {
            const tcx = simTiles[i].rect.x + simTiles[i].rect.w / 2;
            fx[i] += K_ASPECT * (cx - tcx);
          }
        } else if (bbAspect < containerAspect * 0.8) {
          // Too tall: compress vertically only
          for (let i = 0; i < simTiles.length; i++) {
            const tcy = simTiles[i].rect.y + simTiles[i].rect.h / 2;
            fy[i] += K_ASPECT * (cy - tcy);
          }
        }
      }
    }

    // 3. Update velocities with damping
    for (let i = 0; i < simTiles.length; i++) {
      simTiles[i].vx = (simTiles[i].vx + fx[i]) * DAMPING;
      simTiles[i].vy = (simTiles[i].vy + fy[i]) * DAMPING;
    }

    // 4. Sweep-move with impulse propagation.
    //    Multiple passes: each pass moves tiles and transfers impulses on contact.
    //    Subsequent passes propagate those impulses through contact chains.
    for (let pass = 0; pass < 5; pass++) {
      let anyMoved = false;

      for (let i = 0; i < simTiles.length; i++) {
        const t = simTiles[i];
        let dx = t.vx;
        let dy = t.vy;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;

        // Clear velocity — it gets consumed by movement this pass
        t.vx = 0;
        t.vy = 0;

        let lastHitIdx = -1;
        for (let step = 0; step < 3; step++) {
          if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) break;

          let minT = 1;
          let hitNx = 0;
          let hitIdx = -1;

          for (let j = 0; j < simTiles.length; j++) {
            if (j === i || j === lastHitIdx) continue;
            const hit = sweepAABB(t.rect, simTiles[j].rect, dx, dy, gap);
            if (hit.t < minT) {
              minT = hit.t;
              hitNx = hit.normalX;
              hitIdx = j;
            }
          }

          t.rect.x += dx * minT;
          t.rect.y += dy * minT;
          maxDisplacement = Math.max(maxDisplacement, Math.abs(dx * minT), Math.abs(dy * minT));
          if (minT > 0.001) anyMoved = true;

          if (minT >= 1) break;

          // Transfer impulse to contacted tile — it will move in a subsequent pass
          const other = simTiles[hitIdx];
          if (hitNx !== 0) {
            other.vx += dx * (1 - minT);
            dx = 0;
            dy = dy * (1 - minT);
          } else {
            other.vy += dy * (1 - minT);
            dy = 0;
            dx = dx * (1 - minT);
          }

          lastHitIdx = hitIdx;
        }
      }

      if (!anyMoved) break;
    }

    if (debugFrames && iter % 4 === 3) {
      debugFrames.push(snapshotFrame(simTiles));
    }

    if (maxDisplacement < EARLY_STOP_THRESHOLD) break;
  }
}

export function packTiles(
  tiles: TileInput[],
  containerW: number,
  containerH: number,
  options: LayoutOptions,
): PackResult {
  if (tiles.length === 0 || containerW <= 0 || containerH <= 0) {
    return { layout: [] };
  }

  const { gap, labelHeight, debug } = options;
  const debugFrames: SimFrame[] | undefined = debug ? [] : undefined;
  const cx = containerW / 2;
  const cy = containerH / 2;
  const containerAspect = containerW / containerH;

  const baseHeight = chooseBaseHeight(tiles, containerW, containerH, labelHeight);
  const simTiles: SimTile[] = [];

  if (tiles.length === 1) {
    const t = tiles[0];
    const scale = t.scaleOverride ?? 1;
    const { w, h } = tileSize(t.aspect, baseHeight, labelHeight, scale);
    simTiles.push({ key: t.key, rect: { x: cx - w / 2, y: cy - h / 2, w, h }, vx: 0, vy: 0 });
    if (debugFrames) debugFrames.push(snapshotFrame(simTiles));

  } else if (tiles.length === 2) {
    const sizes = tiles.map((t) => tileSize(t.aspect, baseHeight, labelHeight, t.scaleOverride ?? 1));
    const totalW = sizes[0].w + gap + sizes[1].w;
    const totalH = sizes[0].h + gap + sizes[1].h;

    const hFits = totalW <= containerW;
    const vFits = totalH <= containerH;
    const hScale = hFits ? 1 : Math.min(containerW / totalW, containerH / Math.max(sizes[0].h, sizes[1].h));
    const vScale = vFits ? 1 : Math.min(containerH / totalH, containerW / Math.max(sizes[0].w, sizes[1].w));
    const hArea = sizes[0].w * sizes[0].h * hScale * hScale + sizes[1].w * sizes[1].h * hScale * hScale;
    const vArea = sizes[0].w * sizes[0].h * vScale * vScale + sizes[1].w * sizes[1].h * vScale * vScale;

    if (hArea >= vArea) {
      const startX = cx - totalW / 2;
      simTiles.push({ key: tiles[0].key, rect: { x: startX, y: cy - sizes[0].h / 2, w: sizes[0].w, h: sizes[0].h }, vx: 0, vy: 0 });
      simTiles.push({ key: tiles[1].key, rect: { x: startX + sizes[0].w + gap, y: cy - sizes[1].h / 2, w: sizes[1].w, h: sizes[1].h }, vx: 0, vy: 0 });
    } else {
      const startY = cy - totalH / 2;
      simTiles.push({ key: tiles[0].key, rect: { x: cx - sizes[0].w / 2, y: startY, w: sizes[0].w, h: sizes[0].h }, vx: 0, vy: 0 });
      simTiles.push({ key: tiles[1].key, rect: { x: cx - sizes[1].w / 2, y: startY + sizes[0].h + gap, w: sizes[1].w, h: sizes[1].h }, vx: 0, vy: 0 });
    }
    if (debugFrames) debugFrames.push(snapshotFrame(simTiles));

  } else {
    // 3+ tiles: incremental swept-collision simulation
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const scale = tile.scaleOverride ?? 1;
      const { w, h } = tileSize(tile.aspect, baseHeight, labelHeight, scale);
      const angle = dropAngle(i);
      // Place new tile outside the bounding box of all existing tiles
      let dropDist = 0;
      if (i > 0) {
        const bb = boundingBox(simTiles.map((t) => t.rect));
        // Distance from center to the far edge of the bounding box + new tile half-size + gap
        const dx = Math.abs(Math.cos(angle));
        const dy = Math.abs(Math.sin(angle));
        const bbHalfW = bb.w / 2 + w / 2 + gap;
        const bbHalfH = bb.h / 2 + h / 2 + gap;
        // How far along the angle direction to clear the bounding box
        dropDist = dx > 0.01 ? bbHalfW / dx : 0;
        if (dy > 0.01) dropDist = Math.max(dropDist, bbHalfH / dy);
        dropDist += Math.max(w, h); // extra margin
      }

      simTiles.push({
        key: tile.key,
        rect: { x: cx - w / 2 + Math.cos(angle) * dropDist, y: cy - h / 2 + Math.sin(angle) * dropDist, w, h },
        vx: 0,
        vy: 0,
      });

      simulate(simTiles, cx, cy, containerAspect, gap, SIM_ITERATIONS, debugFrames);
    }
  }

  // Scale to fit container
  const bb = boundingBox(simTiles.map((t) => t.rect));
  const bbWithPad = { w: bb.w + gap * 2, h: bb.h + gap * 2 };
  const rawScale = Math.min(containerW / bbWithPad.w, containerH / bbWithPad.h, 1);

  // If we need to scale down, first inflate gaps so they survive scaling
  if (rawScale < 1 && tiles.length > 2) {
    const preScaleGap = gap / rawScale;
    resolveInitialOverlaps(simTiles, preScaleGap);
  }

  // Recompute after gap inflation
  const bb2 = boundingBox(simTiles.map((t) => t.rect));
  const bbWithPad2 = { w: bb2.w + gap * 2, h: bb2.h + gap * 2 };
  const finalScale = Math.min(containerW / bbWithPad2.w, containerH / bbWithPad2.h, 1);

  const bbCx = bb2.x + bb2.w / 2;
  const bbCy = bb2.y + bb2.h / 2;

  const layout: TileLayout[] = simTiles.map((t) => {
    const rx = (t.rect.x + t.rect.w / 2 - bbCx) * finalScale;
    const ry = (t.rect.y + t.rect.h / 2 - bbCy) * finalScale;
    const w = t.rect.w * finalScale;
    const h = t.rect.h * finalScale;
    return {
      key: t.key,
      x: Math.round(cx + rx - w / 2),
      y: Math.round(cy + ry - h / 2),
      width: Math.floor(w),
      height: Math.floor(h),
    };
  });

  if (debugFrames) {
    debugFrames.push({
      tiles: layout.map((l) => ({ key: l.key, x: l.x, y: l.y, w: l.width, h: l.height })),
    });
  }

  return { layout, debugFrames };
}
