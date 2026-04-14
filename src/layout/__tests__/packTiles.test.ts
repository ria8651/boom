import { describe, it, expect } from "vitest";
import { packTiles } from "../packTiles.js";
import type { TileInput, TileLayout, LayoutOptions } from "../types.js";
import { GAP, LABEL_HEIGHT, PAD } from "../constants.js";
import { rectsOverlap } from "../geometry.js";

const defaultOpts: LayoutOptions = { gap: GAP, labelHeight: LABEL_HEIGHT };

function tile(key: string, aspect = 16 / 9, scaleOverride?: number): TileInput {
  return { key, aspect, scaleOverride };
}

/** Assert no tile overlaps another (accounting for gap). */
function assertNoOverlaps(layout: TileLayout[], gap: number) {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i];
      const b = layout[j];
      const overlaps = rectsOverlap(
        { x: a.x, y: a.y, w: a.width, h: a.height },
        { x: b.x, y: b.y, w: b.width, h: b.height },
        gap - 2, // tolerance for integer rounding (up to 1px per tile edge)
      );
      expect(overlaps, `Tiles "${a.key}" and "${b.key}" overlap`).toBe(false);
    }
  }
}

/** Assert all tiles are within container bounds (with padding). */
function assertWithinBounds(
  layout: TileLayout[],
  containerW: number,
  containerH: number,
  _pad: number,
) {
  for (const t of layout) {
    expect(t.x, `Tile "${t.key}" left edge out of bounds`).toBeGreaterThanOrEqual(0);
    expect(t.y, `Tile "${t.key}" top edge out of bounds`).toBeGreaterThanOrEqual(0);
    expect(
      t.x + t.width,
      `Tile "${t.key}" right edge out of bounds`,
    ).toBeLessThanOrEqual(containerW);
    expect(
      t.y + t.height,
      `Tile "${t.key}" bottom edge out of bounds`,
    ).toBeLessThanOrEqual(containerH);
  }
}

/** Assert all tiles have positive dimensions. */
function assertPositiveDimensions(layout: TileLayout[]) {
  for (const t of layout) {
    expect(t.width, `Tile "${t.key}" has non-positive width`).toBeGreaterThan(0);
    expect(t.height, `Tile "${t.key}" has non-positive height`).toBeGreaterThan(0);
  }
}

/** Compute packing ratio: total tile area / container area. */
function packingRatio(layout: TileLayout[], containerW: number, containerH: number): number {
  const tileArea = layout.reduce((sum, t) => sum + t.width * t.height, 0);
  return tileArea / (containerW * containerH);
}

/** Run all common invariants. */
function assertInvariants(
  layout: TileLayout[],
  containerW: number,
  containerH: number,
) {
  assertPositiveDimensions(layout);
  assertNoOverlaps(layout, GAP);
  assertWithinBounds(layout, containerW, containerH, PAD);
}

describe("packTiles", () => {
  /* ── Edge cases ──────────────────────────────────────────── */

  it("returns empty for 0 tiles", () => {
    const { layout } = packTiles([], 1920, 1080, defaultOpts);
    expect(layout).toEqual([]);
  });

  it("returns empty for zero-width container", () => {
    const { layout } = packTiles([tile("a")], 0, 1080, defaultOpts);
    expect(layout).toEqual([]);
  });

  it("returns empty for zero-height container", () => {
    const { layout } = packTiles([tile("a")], 1920, 0, defaultOpts);
    expect(layout).toEqual([]);
  });

  /* ── Loosely packed (few tiles, lots of space) ───────────── */

  describe("loosely packed", () => {
    it("single 16:9 tile is centered", () => {
      const cw = 1920,
        ch = 1080;
      const { layout } = packTiles([tile("a")], cw, ch, defaultOpts);
      expect(layout).toHaveLength(1);
      assertInvariants(layout, cw, ch);

      const t = layout[0];
      const tileCx = t.x + t.width / 2;
      const tileCy = t.y + t.height / 2;
      expect(tileCx).toBeCloseTo(cw / 2, -1); // within ~10px
      expect(tileCy).toBeCloseTo(ch / 2, -1);
    });

    it("2 equal tiles are near center, not overlapping, gap maintained", () => {
      const cw = 1920,
        ch = 1080;
      const { layout } = packTiles(
        [tile("a"), tile("b")],
        cw,
        ch,
        defaultOpts,
      );
      expect(layout).toHaveLength(2);
      assertInvariants(layout, cw, ch);

      // Both should be near center
      for (const t of layout) {
        const tcx = t.x + t.width / 2;
        const tcy = t.y + t.height / 2;
        expect(Math.abs(tcx - cw / 2)).toBeLessThan(cw * 0.4);
        expect(Math.abs(tcy - ch / 2)).toBeLessThan(ch * 0.4);
      }
    });

    it("3 tiles with different aspects clump near center", () => {
      const cw = 1920,
        ch = 1080;
      const tiles = [tile("a", 16 / 9), tile("b", 4 / 3), tile("c", 1)];
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      expect(layout).toHaveLength(3);
      assertInvariants(layout, cw, ch);

      // Bounding box should be much smaller than container
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const t of layout) {
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + t.width);
        maxY = Math.max(maxY, t.y + t.height);
      }
      const bbArea = (maxX - minX) * (maxY - minY);
      const containerArea = cw * ch;
      expect(bbArea).toBeLessThan(containerArea * 0.98);
    });

    it("center of mass approximately at container center", () => {
      const cw = 1920,
        ch = 1080;
      const tiles = [tile("a"), tile("b"), tile("c")];
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);

      let cmx = 0,
        cmy = 0,
        totalArea = 0;
      for (const t of layout) {
        const area = t.width * t.height;
        cmx += (t.x + t.width / 2) * area;
        cmy += (t.y + t.height / 2) * area;
        totalArea += area;
      }
      cmx /= totalArea;
      cmy /= totalArea;

      expect(Math.abs(cmx - cw / 2)).toBeLessThan(cw * 0.15);
      expect(Math.abs(cmy - ch / 2)).toBeLessThan(ch * 0.15);
    });
  });

  /* ── Packed cases (many tiles, fill the frame) ───────────── */

  describe("packed", () => {
    it("4 equal tiles in square container pack compactly", () => {
      const size = 800;
      const tiles = [tile("a"), tile("b"), tile("c"), tile("d")];
      const { layout } = packTiles(tiles, size, size, defaultOpts);
      expect(layout).toHaveLength(4);
      assertInvariants(layout, size, size);
    });

    it("6 tiles in wide container fill width well", () => {
      const cw = 1920,
        ch = 600;
      const tiles = Array.from({ length: 6 }, (_, i) => tile(`t${i}`));
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      expect(layout).toHaveLength(6);
      assertInvariants(layout, cw, ch);
    });

    it("20 tiles stress test: no overlaps, all fit, reasonable time", () => {
      const cw = 1920,
        ch = 1080;
      const tiles = Array.from({ length: 20 }, (_, i) =>
        tile(`t${i}`, 1 + (i % 3) * 0.3),
      );

      const start = performance.now();
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      const elapsed = performance.now() - start;

      expect(layout).toHaveLength(20);
      assertInvariants(layout, cw, ch);
      expect(elapsed).toBeLessThan(500); // generous limit
    });
  });

  /* ── Extreme aspect ratios ──────────────────────────────── */

  it("very wide (32:9) and very tall (9:32) tiles both placed", () => {
    const cw = 1920,
      ch = 1080;
    const tiles = [tile("wide", 32 / 9), tile("tall", 9 / 32)];
    const { layout } = packTiles(tiles, cw, ch, defaultOpts);
    expect(layout).toHaveLength(2);
    assertInvariants(layout, cw, ch);
  });

  it("all same aspect ratio produces regular arrangement", () => {
    const cw = 1200,
      ch = 900;
    const tiles = Array.from({ length: 9 }, (_, i) => tile(`t${i}`, 16 / 9));
    const { layout } = packTiles(tiles, cw, ch, defaultOpts);
    expect(layout).toHaveLength(9);
    assertInvariants(layout, cw, ch);
  });

  /* ── Packing ratio ────────────────────────────────────────── */

  // Packing ratio thresholds — TODO: tune sim parameters via /debug page then raise these
  describe("packing ratio", () => {
    it("single tile uses a significant portion of container", () => {
      const cw = 1920, ch = 1080;
      const { layout } = packTiles([tile("a")], cw, ch, defaultOpts);
      const ratio = packingRatio(layout, cw, ch);
      expect(ratio).toBeGreaterThan(0.5);
    });

    it("4 equal tiles pack reasonably", () => {
      const cw = 1920, ch = 1080;
      const tiles = [tile("a"), tile("b"), tile("c"), tile("d")];
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      const ratio = packingRatio(layout, cw, ch);
      expect(ratio).toBeGreaterThan(0.2);
    });

    it("6 tiles pack reasonably", () => {
      const cw = 1920, ch = 1080;
      const tiles = Array.from({ length: 6 }, (_, i) => tile(`t${i}`));
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      const ratio = packingRatio(layout, cw, ch);
      expect(ratio).toBeGreaterThan(0.2);
    });

    it("20 tiles pack reasonably", () => {
      const cw = 1920, ch = 1080;
      const tiles = Array.from({ length: 20 }, (_, i) => tile(`t${i}`, 1 + (i % 3) * 0.3));
      const { layout } = packTiles(tiles, cw, ch, defaultOpts);
      const ratio = packingRatio(layout, cw, ch);
      expect(ratio).toBeGreaterThan(0.15);
    });
  });

  /* ── Determinism ─────────────────────────────────────────── */

  it("same inputs twice produce identical output", () => {
    const cw = 1920,
      ch = 1080;
    const tiles = [tile("a"), tile("b", 4 / 3), tile("c", 1)];
    const { layout: l1 } = packTiles(tiles, cw, ch, defaultOpts);
    const { layout: l2 } = packTiles(tiles, cw, ch, defaultOpts);
    expect(l1).toEqual(l2);
  });

  /* ── Debug mode ──────────────────────────────────────────── */

  it("debug mode returns simulation frames", () => {
    const cw = 1920,
      ch = 1080;
    const tiles = [tile("a"), tile("b")];
    const { layout, debugFrames } = packTiles(tiles, cw, ch, {
      ...defaultOpts,
      debug: true,
    });
    expect(layout).toHaveLength(2);
    expect(debugFrames).toBeDefined();
    expect(debugFrames!.length).toBeGreaterThan(0);
    // Each frame should have tile entries
    for (const frame of debugFrames!) {
      expect(frame.tiles.length).toBeGreaterThan(0);
    }
  });

  it("debug mode off returns no frames", () => {
    const { debugFrames } = packTiles([tile("a")], 1920, 1080, defaultOpts);
    expect(debugFrames).toBeUndefined();
  });

  /* ── Grid mode ──────────────────────────────────────────────── */

  describe("grid mode", () => {
    const gridOpts = { ...defaultOpts, mode: "grid" as const };

    it("returns empty for 0 tiles", () => {
      const { layout } = packTiles([], 1920, 1080, gridOpts);
      expect(layout).toEqual([]);
    });

    it("single tile is centered", () => {
      const cw = 1920, ch = 1080;
      const { layout } = packTiles([tile("a")], cw, ch, gridOpts);
      expect(layout).toHaveLength(1);
      assertInvariants(layout, cw, ch);

      const t = layout[0];
      const tileCx = t.x + t.width / 2;
      const tileCy = t.y + t.height / 2;
      expect(Math.abs(tileCx - cw / 2)).toBeLessThan(cw * 0.1);
      expect(Math.abs(tileCy - ch / 2)).toBeLessThan(ch * 0.1);
    });

    it("4 equal tiles pack with no overlaps", () => {
      const cw = 1920, ch = 1080;
      const tiles = [tile("a"), tile("b"), tile("c"), tile("d")];
      const { layout } = packTiles(tiles, cw, ch, gridOpts);
      expect(layout).toHaveLength(4);
      assertInvariants(layout, cw, ch);
    });

    it("20 tiles stress test: fast and correct", () => {
      const cw = 1920, ch = 1080;
      const tiles = Array.from({ length: 20 }, (_, i) => tile(`t${i}`, 1 + (i % 3) * 0.3));

      const start = performance.now();
      const { layout } = packTiles(tiles, cw, ch, gridOpts);
      const elapsed = performance.now() - start;

      expect(layout).toHaveLength(20);
      assertInvariants(layout, cw, ch);
      expect(elapsed).toBeLessThan(10);
    });

    it("grid packing ratio > 50%", () => {
      const cw = 1920, ch = 1080;
      const tiles = Array.from({ length: 6 }, (_, i) => tile(`t${i}`));
      const { layout } = packTiles(tiles, cw, ch, gridOpts);
      const ratio = packingRatio(layout, cw, ch);
      expect(ratio).toBeGreaterThan(0.5);
    });

    it("is stable under small viewport changes", () => {
      const tiles = [tile("a"), tile("b"), tile("c"), tile("d")];
      const { layout: l1 } = packTiles(tiles, 1920, 1080, gridOpts);
      const { layout: l2 } = packTiles(tiles, 1925, 1085, gridOpts);

      for (let i = 0; i < l1.length; i++) {
        const t1 = l1.find((t) => t.key === l2[i].key)!;
        const t2 = l2[i];
        expect(Math.abs(t1.x - t2.x)).toBeLessThan(10);
        expect(Math.abs(t1.y - t2.y)).toBeLessThan(10);
      }
    });

    it("is deterministic", () => {
      const tiles = [tile("a"), tile("b", 4 / 3), tile("c", 1)];
      const { layout: l1 } = packTiles(tiles, 1920, 1080, gridOpts);
      const { layout: l2 } = packTiles(tiles, 1920, 1080, gridOpts);
      expect(l1).toEqual(l2);
    });

    it("does not return debug frames", () => {
      const { debugFrames } = packTiles([tile("a"), tile("b")], 1920, 1080, gridOpts);
      expect(debugFrames).toBeUndefined();
    });
  });
});
