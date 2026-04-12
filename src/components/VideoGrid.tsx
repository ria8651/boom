import { useTracks, VideoTrack, isTrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { useEffect, useMemo, useState } from "react";

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

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  );
}

/**
 * Calculate optimal grid columns for the given tile count and container size.
 * Maximises tile size while maintaining 16:9 aspect ratio.
 */
/**
 * Calculate optimal grid columns and tile dimensions for the given
 * tile count and container size. Maximises tile size while keeping
 * all tiles within the container (no overflow).
 */
const LABEL_HEIGHT = 24; // height of participant name label below tile

function computeLayout(count: number, width: number, height: number) {
  if (count <= 0) return { cols: 1, tileWidth: width, tileHeight: width / (16 / 9) };

  const ASPECT = 16 / 9;
  const GAP = 8; // matches --room-gap
  let bestCols = 1;
  let bestW = 0;
  let bestH = 0;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const maxTileW = (width - GAP * (cols - 1)) / cols;
    // Subtract label height per row from available vertical space
    const maxTileH = (height - GAP * (rows - 1) - LABEL_HEIGHT * rows) / rows;
    // Fit 16:9 tile within the cell
    let w = maxTileW;
    let h = w / ASPECT;
    if (h > maxTileH) {
      h = maxTileH;
      w = h * ASPECT;
    }
    if (w * h > bestW * bestH) {
      bestW = w;
      bestH = h;
      bestCols = cols;
    }
  }

  return { cols: bestCols, tileWidth: bestW, tileHeight: bestH };
}

function tileKey(trackRef: TrackReferenceOrPlaceholder) {
  return `${trackRef.participant.identity}-${trackRef.source}`;
}

interface TileProps {
  trackRef: TrackReferenceOrPlaceholder;
  isFocused?: boolean;
  onFocus: () => void;
}

function Tile({ trackRef, isFocused, onFocus }: TileProps) {
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = trackRef.publication?.track && !trackRef.publication.isMuted;
  const isMicMuted =
    trackRef.participant
      ?.getTrackPublication(Track.Source.Microphone)
      ?.isMuted ?? true;

  // Get the video track's native dimensions for focus mode aspect ratio
  const dims = trackRef.publication?.dimensions;
  const tileStyle: React.CSSProperties | undefined =
    isFocused && hasVideo && dims?.width && dims.height
      ? { aspectRatio: `${dims.width} / ${dims.height}` }
      : undefined;

  return (
    <div className="participant-wrapper">
      <div
        className={`participant-tile${isScreenShare ? " participant-tile--screenshare" : ""}`}
        style={tileStyle}
      >
        {hasVideo && isTrackReference(trackRef) ? (
          <VideoTrack trackRef={trackRef} />
        ) : (
          <div className="participant-placeholder">
            <PersonIcon />
          </div>
        )}
        <button className="focus-btn" onClick={onFocus} aria-label={isFocused ? "Exit focus" : "Focus"}>
          {isFocused ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </div>
      <div className="participant-info">
        {isMicMuted && !isScreenShare && <MicOffIcon />}
        <span>
          {trackRef.participant.name || trackRef.participant.identity}
          {isScreenShare ? " (screen)" : ""}
        </span>
      </div>
    </div>
  );
}

export default function VideoGrid({ containerWidth, containerHeight }: { containerWidth: number; containerHeight: number }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  // Clear focus if the focused track disappears
  useEffect(() => {
    if (focusedKey && !tracks.some((t) => tileKey(t) === focusedKey)) {
      setFocusedKey(null);
    }
  }, [tracks, focusedKey]);

  // Compute grid layout from parent-provided dimensions
  const PAD = 16; // matches --room-pad (1rem)
  const w = Math.max(0, containerWidth - PAD * 2);
  const h = Math.max(0, containerHeight - PAD * 2);
  const layout = computeLayout(tracks.length, w, h);

  // Focus sidebar direction based on content + container aspect
  const focusedTrack = focusedKey ? tracks.find((t) => tileKey(t) === focusedKey) : null;
  const focusDir = useMemo(() => {
    if (!focusedTrack) return "row" as const;
    const dims = focusedTrack.publication?.dimensions;
    const contentAspect = dims?.width && dims.height ? dims.width / dims.height : 16 / 9;
    const containerAspect = w / h;
    return contentAspect >= containerAspect ? "column" as const : "row" as const;
  }, [focusedTrack, w, h]);

  const focused = focusedKey ? tracks.find((t) => tileKey(t) === focusedKey) : null;
  const others = focused ? tracks.filter((t) => tileKey(t) !== focusedKey) : [];

  // Focus layout: one big tile + sidebar strip
  if (focused) {
    return (
      <div className={`focus-layout focus-layout--${focusDir}`}>
        <div className="focus-main">
          <Tile
            trackRef={focused}
            isFocused
            onFocus={() => setFocusedKey(null)}
          />
        </div>
        {others.length > 0 && (
          <div className="focus-sidebar">
            {others.map((trackRef) => (
              <Tile
                key={tileKey(trackRef)}
                trackRef={trackRef}
                onFocus={() => setFocusedKey(tileKey(trackRef))}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Grid layout
  return (
    <div
      className="video-grid"
      style={{
        "--grid-cols": layout.cols,
        "--tile-w": `${layout.tileWidth}px`,
        "--tile-h": `${layout.tileHeight}px`,
      } as React.CSSProperties}
    >
      {tracks.map((trackRef) => (
        <Tile
          key={tileKey(trackRef)}
          trackRef={trackRef}
          onFocus={() => setFocusedKey(tileKey(trackRef))}
        />
      ))}
    </div>
  );
}
