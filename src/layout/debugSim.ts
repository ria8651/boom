/**
 * Instrumented simulation runner that records every sub-step for the debug visualizer.
 * Separate from packTiles.ts — this is only used by the debug page.
 */

import type { Rect } from "./geometry.js";
import { sweepAABB, boundingBox } from "./geometry.js";
import type {
  SimTrace,
  SimStep,
  SubStep,
  TileState,
  ForceTrace,
  SweepTrace,
  ContactTrace,
} from "./debugTypes.js";

export interface DebugTileInput {
  key: string;
  w: number;
  h: number;
}

interface SimTile {
  key: string;
  rect: Rect;
  vx: number;
  vy: number;
}

export interface SimParams {
  gravity: number;
  aspect: number;
  damping: number;
  iterations: number;
  dropDistance: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  gravity: 0.08,
  aspect: 0,
  damping: 0.8,
  iterations: 150,
  dropDistance: 0.6,
};

function dropAngle(index: number): number {
  return index * 2.399963;
}

function cloneTiles(tiles: SimTile[]): TileState[] {
  return tiles.map((t) => ({
    key: t.key,
    rect: { ...t.rect },
    vx: t.vx,
    vy: t.vy,
  }));
}


function simulateInstrumented(
  simTiles: SimTile[],
  cx: number,
  cy: number,
  containerAspect: number,
  gap: number,
  params: SimParams,
  steps: SimStep[],
  stepOffset: number,
): void {
  for (let iter = 0; iter < params.iterations; iter++) {
    const subSteps: SubStep[] = [];

    const fx = new Float64Array(simTiles.length);
    const fy = new Float64Array(simTiles.length);
    const forces: ForceTrace[] = [];

    // 1. Center gravity
    for (let i = 0; i < simTiles.length; i++) {
      const t = simTiles[i];
      const tcx = t.rect.x + t.rect.w / 2;
      const tcy = t.rect.y + t.rect.h / 2;
      const gx = params.gravity * (cx - tcx);
      const gy = params.gravity * (cy - tcy);
      fx[i] += gx;
      fy[i] += gy;
      forces.push({ tileIdx: i, fx: gx, fy: gy, kind: "gravity" });
    }

    // 2. Aspect ratio matching — compress the long axis only
    if (params.aspect > 0 && simTiles.length > 1) {
      const rects = simTiles.map((t) => t.rect);
      const bb = boundingBox(rects);
      if (bb.w > 0 && bb.h > 0) {
        const bbAspect = bb.w / bb.h;
        if (bbAspect > containerAspect * 1.2) {
          for (let i = 0; i < simTiles.length; i++) {
            const tcx = simTiles[i].rect.x + simTiles[i].rect.w / 2;
            const ax = params.aspect * (cx - tcx);
            fx[i] += ax;
            forces.push({ tileIdx: i, fx: ax, fy: 0, kind: "aspect" });
          }
        } else if (bbAspect < containerAspect * 0.8) {
          for (let i = 0; i < simTiles.length; i++) {
            const tcy = simTiles[i].rect.y + simTiles[i].rect.h / 2;
            const ay = params.aspect * (cy - tcy);
            fy[i] += ay;
            forces.push({ tileIdx: i, fx: 0, fy: ay, kind: "aspect" });
          }
        }
      }
    }

    subSteps.push({
      type: "forces",
      tiles: cloneTiles(simTiles),
      forces,
      description: `Apply forces (gravity + aspect)`,
    });

    // 3. Update velocities
    for (let i = 0; i < simTiles.length; i++) {
      simTiles[i].vx = (simTiles[i].vx + fx[i]) * params.damping;
      simTiles[i].vy = (simTiles[i].vy + fy[i]) * params.damping;
    }

    // 4. Sweep-move with impulse propagation (multiple passes)
    let maxDisplacement = 0;
    for (let pass = 0; pass < 5; pass++) {
      let anyMoved = false;

      for (let i = 0; i < simTiles.length; i++) {
        const t = simTiles[i];
        let dx = t.vx;
        let dy = t.vy;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;

        t.vx = 0;
        t.vy = 0;

        let lastHitIdx = -1;

        for (let step = 0; step < 3; step++) {
          if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) break;

          const sweeps: SweepTrace[] = [];
          let minT = 1;
          let hitNx = 0,
            hitNy = 0;
          let hitIdx = -1;

          for (let j = 0; j < simTiles.length; j++) {
            if (j === i || j === lastHitIdx) continue;
            const hit = sweepAABB(t.rect, simTiles[j].rect, dx, dy, gap);
            sweeps.push({
              tileIdx: i,
              targetIdx: j,
              dx,
              dy,
              t: hit.t,
              normalX: hit.normalX,
              normalY: hit.normalY,
              hit: hit.t < 1,
            });
            if (hit.t < minT) {
              minT = hit.t;
              hitNx = hit.normalX;
              hitNy = hit.normalY;
              hitIdx = j;
            }
          }

          t.rect.x += dx * minT;
          t.rect.y += dy * minT;
          maxDisplacement = Math.max(maxDisplacement, Math.abs(dx * minT), Math.abs(dy * minT));
          if (minT > 0.001) anyMoved = true;

          const contacts: ContactTrace[] = [];
          if (minT < 1 && hitIdx >= 0) {
            contacts.push({
              tileIdx: i,
              otherIdx: hitIdx,
              normalX: hitNx,
              normalY: hitNy,
              contactX: t.rect.x + t.rect.w / 2 + (hitNx * t.rect.w) / 2,
              contactY: t.rect.y + t.rect.h / 2 + (hitNy * t.rect.h) / 2,
            });
          }

          subSteps.push({
            type: step === 0 ? "sweep" : "slide",
            tileIdx: i,
            tiles: cloneTiles(simTiles),
            sweeps,
            contacts,
            description:
              step === 0
                ? `[pass ${pass}] Sweep tile ${i} (${t.key}) dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}${minT < 1 ? ` → contact t=${minT.toFixed(3)} with tile ${hitIdx}` : " → no contact"}`
                : `[pass ${pass}] Slide tile ${i} (${t.key})${minT < 1 ? ` → contact with tile ${hitIdx}` : " → clear"}`,
          });

          if (minT >= 1) break;

          // Transfer full remaining impulse to contacted tile for next pass
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

    steps.push({
      iteration: stepOffset + iter,
      tileCount: simTiles.length,
      subSteps,
    });

    if (maxDisplacement < 0.1) break;
  }
}

export function runDebugSim(
  tiles: DebugTileInput[],
  containerW: number,
  containerH: number,
  gap: number,
  params: SimParams = DEFAULT_SIM_PARAMS,
): SimTrace {
  const cx = containerW / 2;
  const cy = containerH / 2;
  const containerAspect = containerW / containerH;
  const steps: SimStep[] = [];
  const simTiles: SimTile[] = [];
  let stepOffset = 0;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const angle = dropAngle(i);
    let dropDist = 0;
    if (i > 0) {
      const bb = boundingBox(simTiles.map((t) => t.rect));
      const dx = Math.abs(Math.cos(angle));
      const dy = Math.abs(Math.sin(angle));
      const bbHalfW = bb.w / 2 + tile.w / 2 + gap;
      const bbHalfH = bb.h / 2 + tile.h / 2 + gap;
      dropDist = dx > 0.01 ? bbHalfW / dx : 0;
      if (dy > 0.01) dropDist = Math.max(dropDist, bbHalfH / dy);
      dropDist += Math.max(tile.w, tile.h) * params.dropDistance;
    }

    simTiles.push({
      key: tile.key,
      rect: {
        x: cx - tile.w / 2 + Math.cos(angle) * dropDist,
        y: cy - tile.h / 2 + Math.sin(angle) * dropDist,
        w: tile.w,
        h: tile.h,
      },
      vx: 0,
      vy: 0,
    });

    // Record the "tile added" state
    steps.push({
      iteration: stepOffset,
      tileCount: simTiles.length,
      subSteps: [
        {
          type: "forces",
          tiles: cloneTiles(simTiles),
          description: `Tile ${i} (${tile.key}) added at angle ${((angle * 180) / Math.PI).toFixed(0)}°`,
        },
      ],
    });
    stepOffset++;

    if (simTiles.length > 1) {
      simulateInstrumented(simTiles, cx, cy, containerAspect, gap, params, steps, stepOffset);
      stepOffset = steps.length;
    }
  }

  return {
    containerW,
    containerH,
    gap,
    steps,
    finalTiles: cloneTiles(simTiles),
  };
}
