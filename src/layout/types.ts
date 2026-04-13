export interface TileInput {
  key: string;
  aspect: number; // width / height
  scaleOverride?: number; // multiplier from resize handle (default 1.0)
}

export interface TileLayout {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutOptions {
  gap: number;
  labelHeight: number;
  debug?: boolean;
}

export interface SimFrame {
  tiles: { key: string; x: number; y: number; w: number; h: number }[];
}

export interface PackResult {
  layout: TileLayout[];
  debugFrames?: SimFrame[];
}
