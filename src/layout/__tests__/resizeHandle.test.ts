import { describe, it, expect } from "vitest";
import { packTiles } from "../packTiles.js";
import type { TileInput, TileLayout, LayoutOptions } from "../types.js";
import { GAP, LABEL_HEIGHT } from "../constants.js";
import { rectsOverlap } from "../geometry.js";

const defaultOpts: LayoutOptions = { gap: GAP, labelHeight: LABEL_HEIGHT };

function tile(key: string, aspect = 16 / 9, scaleOverride?: number): TileInput {
  return { key, aspect, scaleOverride };
}

function assertNoOverlaps(layout: TileLayout[], gap: number) {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i];
      const b = layout[j];
      const overlaps = rectsOverlap(
        { x: a.x, y: a.y, w: a.width, h: a.height },
        { x: b.x, y: b.y, w: b.width, h: b.height },
        gap - 2,
      );
      expect(overlaps, `Tiles "${a.key}" and "${b.key}" overlap`).toBe(false);
    }
  }
}

function assertWithinBounds(layout: TileLayout[], cw: number, ch: number) {
  for (const t of layout) {
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(cw);
    expect(t.y + t.height).toBeLessThanOrEqual(ch);
  }
}

describe("resize handle (scaleOverride)", () => {
  it("scaleOverride=1 matches no-override output", () => {
    const cw = 1920,
      ch = 1080;
    const tilesNoOverride = [tile("a"), tile("b"), tile("c")];
    const tilesWithOverride = [
      tile("a", 16 / 9, 1),
      tile("b", 16 / 9, 1),
      tile("c", 16 / 9, 1),
    ];
    const { layout: l1 } = packTiles(tilesNoOverride, cw, ch, defaultOpts);
    const { layout: l2 } = packTiles(tilesWithOverride, cw, ch, defaultOpts);
    expect(l1).toEqual(l2);
  });

  it("scaleOverride=2 produces a proportionally larger tile", () => {
    const cw = 1920,
      ch = 1080;
    const tilesNormal = [tile("a"), tile("b")];
    const tilesScaled = [tile("a", 16 / 9, 2), tile("b")];

    const { layout: lNormal } = packTiles(tilesNormal, cw, ch, defaultOpts);
    const { layout: lScaled } = packTiles(tilesScaled, cw, ch, defaultOpts);

    const normalA = lNormal.find((t) => t.key === "a")!;
    const scaledA = lScaled.find((t) => t.key === "a")!;

    // Scaled tile should be noticeably larger (at least 1.3x after fitting)
    const normalArea = normalA.width * normalA.height;
    const scaledArea = scaledA.width * scaledA.height;
    expect(scaledArea).toBeGreaterThan(normalArea * 1.3);
  });

  it("override on one tile: no overlaps with neighbors", () => {
    const cw = 1920,
      ch = 1080;
    const tiles = [
      tile("a", 16 / 9, 1.5),
      tile("b"),
      tile("c"),
      tile("d"),
    ];
    const { layout } = packTiles(tiles, cw, ch, defaultOpts);
    expect(layout).toHaveLength(4);
    assertNoOverlaps(layout, GAP);
    assertWithinBounds(layout, cw, ch);
  });

  it("multiple tiles with different overrides: all fit, no overlaps", () => {
    const cw = 1920,
      ch = 1080;
    const tiles = [
      tile("a", 16 / 9, 1.8),
      tile("b", 4 / 3, 0.7),
      tile("c", 1, 1.2),
      tile("d", 16 / 9),
    ];
    const { layout } = packTiles(tiles, cw, ch, defaultOpts);
    expect(layout).toHaveLength(4);
    assertNoOverlaps(layout, GAP);
    assertWithinBounds(layout, cw, ch);
  });

  it("small scaleOverride=0.5 produces a smaller tile", () => {
    const cw = 1920,
      ch = 1080;
    const tilesNormal = [tile("a"), tile("b")];
    const tilesSmall = [tile("a", 16 / 9, 0.5), tile("b")];

    const { layout: lNormal } = packTiles(tilesNormal, cw, ch, defaultOpts);
    const { layout: lSmall } = packTiles(tilesSmall, cw, ch, defaultOpts);

    const normalA = lNormal.find((t) => t.key === "a")!;
    const smallA = lSmall.find((t) => t.key === "a")!;

    const normalArea = normalA.width * normalA.height;
    const smallArea = smallA.width * smallA.height;
    expect(smallArea).toBeLessThan(normalArea * 0.8);
  });
});
