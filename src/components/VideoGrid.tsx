import { useTracks, VideoTrack, isTrackReference, useTrackVolume } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { packTiles } from "../layout/packTiles.js";
import type { TileLayout, LayoutMode } from "../layout/types.js";
import { GAP, PAD, LABEL_HEIGHT, DEFAULT_ASPECT } from "../layout/constants.js";

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

/* ── Tile component ──────────────────────────────────────────── */

export function tileKey(trackRef: TrackReferenceOrPlaceholder) {
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

export function Tile({ trackRef, isFocused, onFocus, style, onResizeStart }: {
  trackRef: TrackReferenceOrPlaceholder;
  isFocused?: boolean;
  onFocus: () => void;
  style?: React.CSSProperties;
  onResizeStart?: (e: React.MouseEvent) => void;
}) {
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = trackRef.publication?.track && !trackRef.publication.isMuted;
  const isMicMuted =
    trackRef.participant?.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
  const SPEAKING_THRESHOLD = 0.5;
  const SMOOTHING_UP = 0.2;
  const SMOOTHING_DOWN = 0.1;
  const MAX_GLOW = 12; // max blur radius in px
  const micTrack = !isScreenShare
    ? trackRef.participant?.getTrackPublication(Track.Source.Microphone)?.track
    : undefined;
  const screenShareAudioTrack = isScreenShare
    ? trackRef.participant?.getTrackPublication(Track.Source.ScreenShareAudio)?.track
    : undefined;
  const micVolume = useTrackVolume(micTrack as never);
  const screenShareVolume = useTrackVolume(screenShareAudioTrack as never);
  const rawVolume = isScreenShare ? screenShareVolume : micVolume;

  // Smooth volume: fast attack, slow release, snap to zero below dead zone
  const smoothedRef = useRef(0);
  const smoothed = (() => {
    const target = rawVolume > SPEAKING_THRESHOLD ? rawVolume : 0;
    const rate = target > smoothedRef.current ? SMOOTHING_UP : SMOOTHING_DOWN;
    smoothedRef.current += (target - smoothedRef.current) * rate;
    if (smoothedRef.current < 0.02) smoothedRef.current = 0;
    return smoothedRef.current;
  })();

  const audioIntensity = Math.min(1, smoothed * 2); // 0–1 range
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
        className={`participant-tile${isScreenShare ? " participant-tile--screenshare" : ""}`}
        style={{
          borderColor: `rgba(${Math.round(255 + (16 - 255) * audioIntensity)}, ${Math.round(255 + (194 - 255) * audioIntensity)}, ${Math.round(255 + (238 - 255) * audioIntensity)}, ${(0.08 + audioIntensity * 0.92).toFixed(2)})`,
          boxShadow: audioIntensity > 0 ? `0 0 ${audioIntensity * MAX_GLOW}px rgba(16, 194, 238, ${(audioIntensity * 0.4).toFixed(2)})` : "none",
        }}
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
      {onResizeStart && (
        <div className="tile-resize-handle" onMouseDown={onResizeStart} />
      )}
    </div>
  );
}

/* ── MiniGrid: measured container that packs tiles ────────────── */

export function MiniGrid({ tracks, onFocus, focusedKeys, layoutMode, containerSize }: {
  tracks: TrackReferenceOrPlaceholder[];
  onFocus: (key: string) => void;
  focusedKeys: Set<string>;
  layoutMode?: LayoutMode;
  containerSize?: { width: number; height: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState({ width: 0, height: 0 });
  const size = containerSize ?? measuredSize;
  const [scaleOverrides, setScaleOverrides] = useState<Map<string, number>>(new Map());

  // Debug animation state
  const [debugPositions, setDebugPositions] = useState<Map<string, { x: number; y: number; w: number; h: number }> | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const debugAnimRef = useRef<number>(0);

  useEffect(() => {
    if (containerSize) return; // Skip self-measurement when size is provided externally
    const el = ref.current;
    if (!el) return;
    const measure = () => setMeasuredSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerSize]);

  const tileInputs = useMemo(() =>
    tracks.map((t) => {
      const key = tileKey(t);
      return {
        key,
        aspect: getTileAspect(t),
        scaleOverride: scaleOverrides.get(key),
      };
    }),
    [tracks, scaleOverrides],
  );

  const w = Math.max(0, size.width - PAD * 2);
  const h = Math.max(0, size.height - PAD * 2);
  const layoutOpts = useMemo(() => ({ gap: GAP, labelHeight: LABEL_HEIGHT, debug: true, mode: layoutMode }), [layoutMode]);
  const packResult = useMemo(() => packTiles(tileInputs, w, h, layoutOpts), [tileInputs, w, h, layoutOpts]);
  const { layout } = packResult;
  const cachedFramesRef = useRef(packResult.debugFrames);
  cachedFramesRef.current = packResult.debugFrames;

  // Play/stop: replay the cached frames from the latest layout computation
  const toggleSimulation = useCallback(() => {
    if (isAnimating) {
      cancelAnimationFrame(debugAnimRef.current);
      setDebugPositions(null);
      setIsAnimating(false);
      return;
    }
    const frames = cachedFramesRef.current;
    if (!frames?.length) return;

    setIsAnimating(true);
    let frameIdx = 0;
    let lastTime = 0;
    const FRAME_DURATION = 30;

    const animate = (time: number) => {
      if (time - lastTime >= FRAME_DURATION) {
        lastTime = time;
        const frame = frames[frameIdx];
        if (frame) {
          const map = new Map<string, { x: number; y: number; w: number; h: number }>();
          for (const t of frame.tiles) map.set(t.key, t);
          setDebugPositions(map);
          frameIdx++;
        }
      }
      if (frameIdx < frames.length) {
        debugAnimRef.current = requestAnimationFrame(animate);
      } else {
        setDebugPositions(null);
        setIsAnimating(false);
      }
    };
    debugAnimRef.current = requestAnimationFrame(animate);
  }, [isAnimating]);

  useEffect(() => () => cancelAnimationFrame(debugAnimRef.current), []);

  // Map layout back to tracks by key
  const layoutMap = useMemo(() => {
    const map = new Map<string, TileLayout>();
    for (const l of layout) map.set(l.key, l);
    return map;
  }, [layout]);

  // Resize handle: start drag
  const onResizeStart = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const pos = layoutMap.get(key);
    if (!pos) return;
    const startHeight = pos.height;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newScale = Math.max(0.5, Math.min(2.0, (startHeight + delta) / startHeight));
      setScaleOverrides((prev) => {
        const next = new Map(prev);
        next.set(key, newScale);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [layoutMap]);

  return (
    <div ref={ref} className="video-grid">
      {tracks.map((trackRef) => {
        const key = tileKey(trackRef);
        const debugPos = debugPositions?.get(key);
        const pos = debugPos
          ? { x: debugPos.x, y: debugPos.y, width: debugPos.w, height: debugPos.h }
          : layoutMap.get(key);
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
            onResizeStart={layoutMode !== "grid" ? (e) => onResizeStart(key, e) : undefined}
          />
        );
      })}
      {layoutMode !== "grid" && (
        <button
          className="layout-debug-btn"
          onClick={toggleSimulation}
          aria-label={isAnimating ? "Stop simulation" : "Replay layout simulation"}
        >
          {isAnimating ? "\u25A0" : "\u25B6"}
        </button>
      )}
    </div>
  );
}

/* ── Main VideoGrid ──────────────────────────────────────────── */

export default function VideoGrid({ containerWidth, containerHeight, layoutMode, containerSize }: { containerWidth: number; containerHeight: number; layoutMode?: LayoutMode; containerSize?: { width: number; height: number } }) {
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
  const focusDir = containerAspect >= 1.4 ? "row" as const : "column" as const;

  // No focus mode — single grid
  if (!hasFocus) {
    return <MiniGrid tracks={tracks} onFocus={toggleFocus} focusedKeys={focusedKeys} layoutMode={layoutMode} containerSize={containerSize} />;
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
        <MiniGrid tracks={focused} onFocus={toggleFocus} focusedKeys={focusedKeys} layoutMode={layoutMode} containerSize={containerSize} />
      </div>
      {others.length > 0 && (
        <>
          <Divider direction={focusDir} onResize={setSplitPercent} containerWidth={containerWidth} containerHeight={containerHeight} />
          <div style={othersStyle} className="focus-half">
            <MiniGrid tracks={others} onFocus={toggleFocus} focusedKeys={focusedKeys} layoutMode={layoutMode} containerSize={containerSize} />
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
