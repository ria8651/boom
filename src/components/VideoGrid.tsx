import { useTracks, VideoTrack, isTrackReference, useIsSpeaking, useTrackVolume } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Icons ───────────────────────────────────────────────────── */

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="4" />
      <path d="M12 14c-6 0-8 3-8 5v1h16v-1c0-2-2-5-8-5z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="muted-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM14.98 11.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9l4.17 4.18L21 19.73 4.27 3z" />
    </svg>
  );
}


/* ── Constants ────────────────────────────────────────────────── */

const LABEL_HEIGHT = 32; // matches --tile-label
const GAP = 8;
const PAD = 16;
const MAX_TILE_AREA = 500_000;
const MAX_TILE_DIM = 960;
const DEFAULT_ASPECT = 16 / 9;

/* ── Packing algorithm ───────────────────────────────────────── */

interface TileInput {
  key: string;
  aspect: number; // width / height
}

interface TileLayout {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect, minGap = 0): boolean {
  return a.x < b.x + b.w + minGap && a.x + a.w + minGap > b.x &&
         a.y < b.y + b.h + minGap && a.y + a.h + minGap > b.y;
}

function tileSize(aspect: number, scale: number, labelH: number, uncapped = false, tileCount = 1): { w: number; h: number } {
  let h = scale;
  let w = h * aspect;
  // Only cap size for small tile counts (1-2) to prevent a single giant tile
  if (!uncapped && tileCount <= 2) {
    const area = w * h;
    if (area > MAX_TILE_AREA) {
      const factor = Math.sqrt(MAX_TILE_AREA / area);
      w *= factor;
      h *= factor;
    }
    if (w > MAX_TILE_DIM) { w = MAX_TILE_DIM; h = w / aspect; }
    if (h > MAX_TILE_DIM) { h = MAX_TILE_DIM; w = h * aspect; }
  }
  return { w, h: h + labelH };
}

/**
 * Try to place all tiles at the given scale. Returns positions or null if they don't fit.
 */
function tryPlace(
  tiles: TileInput[],
  scale: number,
  containerW: number,
  containerH: number,
  gap: number,
  labelH: number,
  uncapped = false,
): TileLayout[] | null {
  const placed: Rect[] = [];
  const result: TileLayout[] = [];
  const cx = containerW / 2;
  const cy = containerH / 2;

  for (const tile of tiles) {
    const { w, h } = tileSize(tile.aspect, scale, labelH, uncapped, tiles.length);

    // Generate candidate positions
    const candidates: { x: number; y: number }[] = [];

    if (placed.length === 0) {
      // First tile: center
      candidates.push({ x: cx - w / 2, y: cy - h / 2 });
    } else {
      // For each placed tile, try sliding along its edges
      for (const p of placed) {
        // Slide along right edge of p
        for (let sy = p.y - h; sy <= p.y + p.h; sy += Math.max(1, h / 4)) {
          candidates.push({ x: p.x + p.w + gap, y: sy });
        }
        // Slide along left edge of p
        for (let sy = p.y - h; sy <= p.y + p.h; sy += Math.max(1, h / 4)) {
          candidates.push({ x: p.x - w - gap, y: sy });
        }
        // Slide along bottom edge of p
        for (let sx = p.x - w; sx <= p.x + p.w; sx += Math.max(1, w / 4)) {
          candidates.push({ x: sx, y: p.y + p.h + gap });
        }
        // Slide along top edge of p
        for (let sx = p.x - w; sx <= p.x + p.w; sx += Math.max(1, w / 4)) {
          candidates.push({ x: sx, y: p.y - h - gap });
        }
      }

      // Also try positions where the new tile touches two placed tiles
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j];
          // Below a, right of b (and vice versa)
          candidates.push({ x: b.x + b.w + gap, y: a.y + a.h + gap });
          candidates.push({ x: a.x + a.w + gap, y: b.y + b.h + gap });
          // Below a, left of b
          candidates.push({ x: b.x - w - gap, y: a.y + a.h + gap });
          candidates.push({ x: a.x - w - gap, y: b.y + b.h + gap });
          // Above a, right of b
          candidates.push({ x: b.x + b.w + gap, y: a.y - h - gap });
          candidates.push({ x: a.x + a.w + gap, y: b.y - h - gap });
          // Centered between a and b horizontally, below both
          const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2 - w / 2;
          const belowBoth = Math.max(a.y + a.h, b.y + b.h) + gap;
          candidates.push({ x: midX, y: belowBoth });
          // Centered between a and b horizontally, above both
          const aboveBoth = Math.min(a.y, b.y) - h - gap;
          candidates.push({ x: midX, y: aboveBoth });
          // Centered between a and b vertically, right of both
          const midY = (a.y + a.h / 2 + b.y + b.h / 2) / 2 - h / 2;
          const rightBoth = Math.max(a.x + a.w, b.x + b.w) + gap;
          candidates.push({ x: rightBoth, y: midY });
          // Centered between a and b vertically, left of both
          const leftBoth = Math.min(a.x, b.x) - w - gap;
          candidates.push({ x: leftBoth, y: midY });
        }
      }
    }

    let bestScore = Infinity;
    let bestPos: { x: number; y: number } | null = null;

    for (const pos of candidates) {
      const rect: Rect = { x: pos.x, y: pos.y, w, h };

      // Must not overlap any placed tile (with gap)
      let overlaps = false;
      for (const p of placed) {
        if (rectsOverlap(rect, p, gap)) { overlaps = true; break; }
      }
      if (overlaps) continue;

      // Must fit in container
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > containerW || rect.y + rect.h > containerH) {
        continue;
      }

      // Score: distance from center (lower is better)
      const tileCx = pos.x + w / 2;
      const tileCy = pos.y + h / 2;
      const dist = Math.hypot(tileCx - cx, tileCy - cy);

      // Bounding box penalty: prefer compact arrangements
      let bbMinX = rect.x, bbMinY = rect.y;
      let bbMaxX = rect.x + rect.w, bbMaxY = rect.y + rect.h;
      for (const p of placed) {
        bbMinX = Math.min(bbMinX, p.x);
        bbMinY = Math.min(bbMinY, p.y);
        bbMaxX = Math.max(bbMaxX, p.x + p.w);
        bbMaxY = Math.max(bbMaxY, p.y + p.h);
      }
      const bbArea = (bbMaxX - bbMinX) * (bbMaxY - bbMinY);
      // Normalise: divide by container area so it's scale-independent
      const bbPenalty = bbArea / (containerW * containerH) * 200;

      // Bonus for touching existing tiles (lower score)
      let touchBonus = 0;
      for (const p of placed) {
        const touching =
          Math.abs(rect.x + rect.w + gap - p.x) < 1 ||
          Math.abs(p.x + p.w + gap - rect.x) < 1 ||
          Math.abs(rect.y + rect.h + gap - p.y) < 1 ||
          Math.abs(p.y + p.h + gap - rect.y) < 1;
        if (touching) touchBonus -= 50;
      }

      // Tiny tiebreaker: prefer top-left to avoid instability from equal scores
      const tiebreaker = (pos.y / containerH + pos.x / containerW) * 0.01;

      const score = dist + bbPenalty + touchBonus + tiebreaker;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    if (!bestPos) return null; // Couldn't place this tile

    placed.push({ x: bestPos.x, y: bestPos.y, w, h });
    result.push({ key: tile.key, x: bestPos.x, y: bestPos.y, width: w, height: h });

    // Recenter all placed tiles so center of mass is at container center
    if (placed.length > 1) {
      let cmx = 0, cmy = 0, totalArea = 0;
      for (const p of placed) {
        const area = p.w * p.h;
        cmx += (p.x + p.w / 2) * area;
        cmy += (p.y + p.h / 2) * area;
        totalArea += area;
      }
      cmx /= totalArea;
      cmy /= totalArea;
      const dx = cx - cmx;
      const dy = cy - cmy;

      // Check if shifting would push anything out of bounds
      let canShift = true;
      for (const p of placed) {
        if (p.x + dx < 0 || p.y + dy < 0 ||
            p.x + p.w + dx > containerW || p.y + p.h + dy > containerH) {
          canShift = false;
          break;
        }
      }

      if (canShift) {
        for (const p of placed) { p.x += dx; p.y += dy; }
        for (const r of result) { r.x += dx; r.y += dy; }
      }
    }
  }

  return result;
}

/**
 * Center the laid-out tiles in the container.
 */
function centerLayout(layout: TileLayout[], containerW: number, containerH: number): TileLayout[] {
  if (layout.length === 0) return layout;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of layout) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }
  const offsetX = (containerW - (maxX - minX)) / 2 - minX;
  const offsetY = (containerH - (maxY - minY)) / 2 - minY;
  return layout.map((t) => ({
    ...t,
    x: Math.round(t.x + offsetX),
    y: Math.round(t.y + offsetY),
    width: Math.round(t.width),
    height: Math.round(t.height),
  }));
}

/**
 * Pack tiles into a container using gravity-based placement with binary search for scale.
 */
function packTiles(
  tiles: TileInput[],
  containerW: number,
  containerH: number,
  uncapped = false,
): TileLayout[] {
  if (tiles.length === 0 || containerW <= 0 || containerH <= 0) return [];

  // Sort largest area first for better packing
  const sorted = [...tiles].sort((a, b) => b.aspect - a.aspect);

  // Binary search for the largest scale that fits
  let lo = 1;
  let hi = Math.max(containerW, containerH);
  let bestLayout: TileLayout[] | null = null;

  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const layout = tryPlace(sorted, mid, containerW, containerH, GAP, LABEL_HEIGHT, uncapped);
    if (layout) {
      bestLayout = layout;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!bestLayout) {
    bestLayout = tryPlace(sorted, 1, containerW, containerH, GAP, LABEL_HEIGHT, uncapped);
    if (!bestLayout) return [];
  }

  return centerLayout(bestLayout, containerW, containerH);
}

/* ── Tile component ──────────────────────────────────────────── */

function tileKey(trackRef: TrackReferenceOrPlaceholder) {
  return `${trackRef.participant.identity}-${trackRef.source}`;
}

function getTileAspect(trackRef: TrackReferenceOrPlaceholder): number {
  const hasVideo = trackRef.publication?.track && !trackRef.publication.isMuted;
  if (hasVideo) {
    const dims = trackRef.publication?.dimensions;
    if (dims?.width && dims.height) return dims.width / dims.height;
  }
  return DEFAULT_ASPECT;
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

function UnpinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" opacity="0.5" />
      <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  );
}

function Tile({ trackRef, isFocused, onFocus, style }: {
  trackRef: TrackReferenceOrPlaceholder;
  isFocused?: boolean;
  onFocus: () => void;
  style?: React.CSSProperties;
}) {
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = trackRef.publication?.track && !trackRef.publication.isMuted;
  const isMicMuted =
    trackRef.participant?.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
  const isSpeaking = useIsSpeaking(trackRef.participant);
  const screenShareAudioTrack = isScreenShare
    ? trackRef.participant?.getTrackPublication(Track.Source.ScreenShareAudio)?.track
    : undefined;
  const screenShareVolume = useTrackVolume(screenShareAudioTrack as never);
  const hasAudioActivity = isScreenShare ? screenShareVolume > 0.01 : isSpeaking;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);

  // Fullscreen via the Fullscreen API
  const enterFullscreen = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    const video = el.querySelector("video");
    if (!video) return;
    video.requestFullscreen?.().then(() => setIsFullscreen(true));
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  return (
    <div className="participant-wrapper" style={style}>
      <div
        ref={tileRef}
        className={`participant-tile${isScreenShare ? " participant-tile--screenshare" : ""}${hasAudioActivity ? " participant-tile--speaking" : ""}`}
      >
        {hasVideo && isTrackReference(trackRef) ? (
          <VideoTrack trackRef={trackRef} />
        ) : (
          <div className="participant-placeholder"><PersonIcon /></div>
        )}
      </div>
      <div className="participant-info">
        {isMicMuted && !isScreenShare && <MicOffIcon />}
        <span>
          {trackRef.participant.name || trackRef.participant.identity}
          {isScreenShare ? " (screen)" : ""}
        </span>
        <span className="participant-actions">
          {hasVideo && !isFullscreen && (
            <button className="tile-action-btn" onClick={enterFullscreen} aria-label="Fullscreen">
              <FullscreenIcon />
            </button>
          )}
          <button
            className={`tile-action-btn${isFocused ? " tile-action-btn--active" : ""}`}
            onClick={onFocus}
            aria-label={isFocused ? "Unpin" : "Pin"}
          >
            {isFocused ? <UnpinIcon /> : <PinIcon />}
          </button>
        </span>
      </div>
    </div>
  );
}

/* ── MiniGrid: measured container that packs tiles ────────────── */

function MiniGrid({ tracks, onFocus, focusedKeys, uncapped }: {
  tracks: TrackReferenceOrPlaceholder[];
  onFocus: (key: string) => void;
  focusedKeys: Set<string>;
  uncapped?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Listen for dimension changes on video tracks
  const tileInputs = useMemo(() =>
    tracks.map((t) => ({ key: tileKey(t), aspect: getTileAspect(t) })),
    [tracks],
  );

  const w = Math.max(0, size.width - PAD * 2);
  const h = Math.max(0, size.height - PAD * 2);
  const layout = useMemo(() => packTiles(tileInputs, w, h, uncapped), [tileInputs, w, h, uncapped]);

  // Map layout back to tracks by key
  const layoutMap = useMemo(() => {
    const map = new Map<string, TileLayout>();
    for (const l of layout) map.set(l.key, l);
    return map;
  }, [layout]);

  return (
    <div ref={ref} className="video-grid">
      {tracks.map((trackRef) => {
        const key = tileKey(trackRef);
        const pos = layoutMap.get(key);
        const style: React.CSSProperties = pos
          ? { position: "absolute", left: pos.x + PAD, top: pos.y + PAD, width: pos.width, height: pos.height }
          : { display: "none" };
        return (
          <Tile
            key={key}
            trackRef={trackRef}
            isFocused={focusedKeys.has(key)}
            onFocus={() => onFocus(key)}
            style={style}
          />
        );
      })}
    </div>
  );
}

/* ── Main VideoGrid ──────────────────────────────────────────── */

export default function VideoGrid({ containerWidth, containerHeight }: { containerWidth: number; containerHeight: number }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [focusedKeys, setFocusedKeys] = useState<Set<string>>(new Set());
  const [splitPercent, setSplitPercent] = useState(75);

  const toggleFocus = useCallback((key: string) => {
    setFocusedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Clear focused keys for tracks that no longer exist
  useEffect(() => {
    const validKeys = new Set(tracks.map(tileKey));
    setFocusedKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]);

  const focused = tracks.filter((t) => focusedKeys.has(tileKey(t)));
  const others = tracks.filter((t) => !focusedKeys.has(tileKey(t)));
  const hasFocus = focused.length > 0;
  const containerAspect = containerWidth / (containerHeight || 1);
  const focusDir = containerAspect >= 1 ? "row" as const : "column" as const;

  // No focus mode — single grid
  if (!hasFocus) {
    return <MiniGrid tracks={tracks} onFocus={toggleFocus} focusedKeys={focusedKeys} />;
  }

  // Focus mode — two packed grids split by percentage
  const focusStyle = focusDir === "row"
    ? { width: `${splitPercent}%` }
    : { height: `${splitPercent}%` };
  const othersStyle = focusDir === "row"
    ? { width: `${100 - splitPercent}%` }
    : { height: `${100 - splitPercent}%` };

  return (
    <div className={`focus-layout focus-layout--${focusDir}`}>
      <div style={focusStyle} className="focus-half">
        <MiniGrid tracks={focused} onFocus={toggleFocus} focusedKeys={focusedKeys} uncapped />
      </div>
      {others.length > 0 && (
        <>
          <Divider direction={focusDir} onResize={setSplitPercent} containerWidth={containerWidth} containerHeight={containerHeight} />
          <div style={othersStyle} className="focus-half">
            <MiniGrid tracks={others} onFocus={toggleFocus} focusedKeys={focusedKeys} />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────── */

function Divider({ direction, onResize, containerWidth, containerHeight }: {
  direction: "row" | "column";
  onResize: (percent: number) => void;
  containerWidth: number;
  containerHeight: number;
}) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const parent = (e.currentTarget as HTMLElement).parentElement;
    if (!parent) return;

    const isRow = direction === "row";
    const parentRect = parent.getBoundingClientRect();
    const totalSize = isRow ? parentRect.width : parentRect.height;
    const parentStart = isRow ? parentRect.left : parentRect.top;

    const onMove = (ev: MouseEvent) => {
      const pos = (isRow ? ev.clientX : ev.clientY) - parentStart;
      const percent = Math.max(20, Math.min(80, (pos / totalSize) * 100));
      onResize(percent);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [direction, onResize, containerWidth, containerHeight]);

  return (
    <div
      className={`focus-divider focus-divider--${direction === "row" ? "vertical" : "horizontal"}`}
      onMouseDown={handleMouseDown}
    />
  );
}
