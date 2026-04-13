import type { Rect } from "./geometry.js";

/** A single tile's state at a point in time */
export interface TileState {
  key: string;
  rect: Rect;
  vx: number;
  vy: number;
}

/** A sweep cast result for visualization */
export interface SweepTrace {
  tileIdx: number;
  targetIdx: number;
  dx: number;
  dy: number;
  t: number; // 0..1
  normalX: number;
  normalY: number;
  hit: boolean;
}

/** Force vector on a tile */
export interface ForceTrace {
  tileIdx: number;
  fx: number;
  fy: number;
  kind: "gravity" | "aspect";
}

/** A contact event */
export interface ContactTrace {
  tileIdx: number;
  otherIdx: number;
  normalX: number;
  normalY: number;
  contactX: number;
  contactY: number;
}

/** A single sub-step within an iteration */
export interface SubStep {
  type: "forces" | "sweep" | "slide" | "resolve_overlap";
  tileIdx?: number;
  tiles: TileState[];
  forces?: ForceTrace[];
  sweeps?: SweepTrace[];
  contacts?: ContactTrace[];
  description: string;
}

/** A full simulation iteration */
export interface SimStep {
  iteration: number;
  tileCount: number; // how many tiles are placed at this point
  subSteps: SubStep[];
}

/** The complete recorded simulation */
export interface SimTrace {
  containerW: number;
  containerH: number;
  gap: number;
  steps: SimStep[];
  finalTiles: TileState[];
}
