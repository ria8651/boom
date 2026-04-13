import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runDebugSim, DEFAULT_SIM_PARAMS, type DebugTileInput, type SimParams } from "../layout/debugSim.js";
import type { SimTrace, SimStep } from "../layout/debugTypes.js";

const COLORS = [
  "#4fc3f7", "#81c784", "#ffb74d", "#e57373",
  "#ba68c8", "#4dd0e1", "#aed581", "#ff8a65",
  "#f06292", "#7986cb", "#a1887f", "#90a4ae",
];

const PRESETS: { label: string; tiles: DebugTileInput[] }[] = [
  {
    label: "4x 16:9",
    tiles: Array.from({ length: 4 }, (_, i) => ({ key: `t${i}`, w: 320, h: 180 })),
  },
  {
    label: "3x mixed",
    tiles: [
      { key: "wide", w: 400, h: 200 },
      { key: "square", w: 200, h: 200 },
      { key: "tall", w: 150, h: 300 },
    ],
  },
  {
    label: "6x 16:9",
    tiles: Array.from({ length: 6 }, (_, i) => ({ key: `t${i}`, w: 280, h: 158 })),
  },
  {
    label: "9x 16:9",
    tiles: Array.from({ length: 9 }, (_, i) => ({ key: `t${i}`, w: 200, h: 113 })),
  },
  {
    label: "8x mixed",
    tiles: [
      { key: "cam1", w: 320, h: 180 },
      { key: "cam2", w: 320, h: 180 },
      { key: "cam3", w: 320, h: 180 },
      { key: "screen", w: 400, h: 225 },
      { key: "cam4", w: 240, h: 180 },
      { key: "cam5", w: 320, h: 180 },
      { key: "tall", w: 180, h: 320 },
      { key: "sq", w: 200, h: 200 },
    ],
  },
];

function drawTile(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number; key: string },
  idx: number,
  scale: number,
  ox: number,
  oy: number,
  highlight: boolean,
) {
  const x = t.x * scale + ox;
  const y = t.y * scale + oy;
  const w = t.w * scale;
  const h = t.h * scale;
  const color = COLORS[idx % COLORS.length];

  ctx.fillStyle = highlight ? color + "60" : color + "30";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = highlight ? color : color + "80";
  ctx.lineWidth = highlight ? 2 : 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "#fff";
  ctx.font = `${Math.max(10, 12 * scale)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t.key, x + w / 2, y + h / 2);
}

function renderFrame(
  canvas: HTMLCanvasElement,
  trace: SimTrace,
  step: SimStep,
  subStepIdx: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, cw, ch);

  // Compute scale to fit container in canvas with padding
  const pad = 40;
  const simW = trace.containerW;
  const simH = trace.containerH;
  // Zoom out to show the full drop area (tiles start ~0.6x outside container)
  const viewH = simH * 1.5;
  const viewW = simW * 1.5;
  const scale = Math.min((cw - pad * 2) / viewW, (ch - pad * 2) / viewH);
  const ox = (cw - simW * scale) / 2;
  const oy = (ch - simH * scale) / 2;

  // Draw container outline
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, simW * scale, simH * scale);

  // Draw center crosshair
  const ccx = ox + (simW / 2) * scale;
  const ccy = oy + (simH / 2) * scale;
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(ccx - 10, ccy);
  ctx.lineTo(ccx + 10, ccy);
  ctx.moveTo(ccx, ccy - 10);
  ctx.lineTo(ccx, ccy + 10);
  ctx.stroke();

  const sub = step.subSteps[Math.min(subStepIdx, step.subSteps.length - 1)];
  if (!sub) return;

  const tiles = sub.tiles;

  // Draw tiles
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const highlight = sub.tileIdx === i;
    drawTile(ctx, { x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h, key: t.key }, i, scale, ox, oy, highlight);
  }

  // Draw forces
  if (sub.forces) {
    for (const f of sub.forces) {
      const t = tiles[f.tileIdx];
      const tcx = (t.rect.x + t.rect.w / 2) * scale + ox;
      const tcy = (t.rect.y + t.rect.h / 2) * scale + oy;
      const fScale = 3 * scale;
      ctx.strokeStyle = f.kind === "gravity" ? "#ffeb3b" : "#ff9800";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tcx, tcy);
      ctx.lineTo(tcx + f.fx * fScale, tcy + f.fy * fScale);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(f.fy, f.fx);
      const tipX = tcx + f.fx * fScale;
      const tipY = tcy + f.fy * fScale;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 6 * Math.cos(angle - 0.4), tipY - 6 * Math.sin(angle - 0.4));
      ctx.lineTo(tipX - 6 * Math.cos(angle + 0.4), tipY - 6 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = f.kind === "gravity" ? "#ffeb3b" : "#ff9800";
      ctx.fill();
    }
  }

  // Draw velocity vectors
  for (const t of tiles) {
    if (Math.abs(t.vx) > 0.1 || Math.abs(t.vy) > 0.1) {
      const tcx = (t.rect.x + t.rect.w / 2) * scale + ox;
      const tcy = (t.rect.y + t.rect.h / 2) * scale + oy;
      const vScale = 2 * scale;
      ctx.strokeStyle = "#2196f380";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tcx, tcy);
      ctx.lineTo(tcx + t.vx * vScale, tcy + t.vy * vScale);
      ctx.stroke();
    }
  }

  // Draw sweep rays
  if (sub.sweeps) {
    for (const s of sub.sweeps) {
      if (!s.hit && s.t >= 1) continue; // skip non-hits for clarity
      const t = tiles[s.tileIdx];
      const startX = (t.rect.x + t.rect.w / 2) * scale + ox;
      const startY = (t.rect.y + t.rect.h / 2) * scale + oy;
      const endX = startX + s.dx * s.t * scale;
      const endY = startY + s.dy * s.t * scale;

      ctx.strokeStyle = s.hit ? "#f44336" : "#4caf5060";
      ctx.lineWidth = s.hit ? 2 : 1;
      ctx.setLineDash(s.hit ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Draw contacts
  if (sub.contacts) {
    for (const c of sub.contacts) {
      const cx2 = c.contactX * scale + ox;
      const cy2 = c.contactY * scale + oy;
      ctx.fillStyle = "#f44336";
      ctx.beginPath();
      ctx.arc(cx2, cy2, 5, 0, Math.PI * 2);
      ctx.fill();
      // Normal arrow
      ctx.strokeStyle = "#f44336";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + c.normalX * 20, cy2 + c.normalY * 20);
      ctx.stroke();
    }
  }

  // Info text
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(sub.description, 8, 8);
  ctx.fillText(
    `Step ${step.iteration} | Tiles: ${step.tileCount} | Sub: ${subStepIdx + 1}/${step.subSteps.length}`,
    8,
    22,
  );
}

// ── Tile editor ───────────────────────────────────────────────

function TileEditor({
  tiles,
  onChange,
}: {
  tiles: DebugTileInput[];
  onChange: (tiles: DebugTileInput[]) => void;
}) {
  const addTile = () => {
    onChange([...tiles, { key: `t${tiles.length}`, w: 280, h: 158 }]);
  };
  const removeTile = (i: number) => {
    onChange(tiles.filter((_, idx) => idx !== i));
  };
  const updateTile = (i: number, field: "w" | "h", val: number) => {
    const next = [...tiles];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="debug-tile-editor">
      <div className="debug-presets">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => onChange(p.tiles)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="debug-tile-list">
        {tiles.map((t, i) => (
          <div key={i} className="debug-tile-row">
            <span style={{ color: COLORS[i % COLORS.length], fontWeight: "bold" }}>{t.key}</span>
            <label>
              W
              <input type="number" value={t.w} onChange={(e) => updateTile(i, "w", +e.target.value)} />
            </label>
            <label>
              H
              <input type="number" value={t.h} onChange={(e) => updateTile(i, "h", +e.target.value)} />
            </label>
            <button onClick={() => removeTile(i)}>x</button>
          </div>
        ))}
      </div>
      <button onClick={addTile}>+ Add tile</button>
    </div>
  );
}

// ── Main debug page ──────────────────────────────────────────

export default function SimDebugPage({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<DebugTileInput[]>(PRESETS[0].tiles);
  const [containerW, setContainerW] = useState(960);
  const [containerH, setContainerH] = useState(540);
  const [gap, setGap] = useState(8);
  const [params, setParams] = useState<SimParams>({ ...DEFAULT_SIM_PARAMS });
  const [stepIdx, setStepIdx] = useState(0);
  const [subStepIdx, setSubStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);

  const trace = useMemo<SimTrace | null>(() => {
    if (tiles.length === 0) return null;
    return runDebugSim(tiles, containerW, containerH, gap, params);
  }, [tiles, containerW, containerH, gap, params]);

  const totalSteps = trace?.steps.length ?? 0;
  const currentStep = trace?.steps[stepIdx];
  const totalSubSteps = currentStep?.subSteps.length ?? 0;

  // Clamp indices when trace changes
  useEffect(() => {
    setStepIdx(0);
    setSubStepIdx(0);
    setPlaying(false);
    playRef.current = false;
  }, [trace]);

  // Render on index change
  useEffect(() => {
    if (!canvasRef.current || !trace || !currentStep) return;
    renderFrame(canvasRef.current, trace, currentStep, subStepIdx);
  }, [trace, stepIdx, subStepIdx, currentStep]);

  // Playback
  useEffect(() => {
    playRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (!playing || !trace) return;
    let raf: number;
    let last = 0;
    const INTERVAL = 60;

    const tick = (time: number) => {
      if (!playRef.current) return;
      if (time - last >= INTERVAL) {
        last = time;
        setStepIdx((si) => {
          if (si < trace.steps.length - 1) {
            const nextStep = trace.steps[si + 1];
            setSubStepIdx(nextStep ? nextStep.subSteps.length - 1 : 0);
            return si + 1;
          }
          // Reached the end — restart from beginning
          setSubStepIdx(0);
          return 0;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, trace, stepIdx]);

  const handleStepChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = +e.target.value;
      setStepIdx(v);
      setSubStepIdx(0);
    },
    [],
  );

  const handleSubStepChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSubStepIdx(+e.target.value);
    },
    [],
  );

  return (
    <div className="debug-page">
      <div className="debug-header">
        <button onClick={onBack}>&larr; Back</button>
        <h2>Layout Simulation Debugger</h2>
        <div className="debug-container-settings">
          <label>
            W
            <input type="number" value={containerW} onChange={(e) => setContainerW(+e.target.value)} />
          </label>
          <label>
            H
            <input type="number" value={containerH} onChange={(e) => setContainerH(+e.target.value)} />
          </label>
          <label>
            Gap
            <input type="number" value={gap} onChange={(e) => setGap(+e.target.value)} />
          </label>
        </div>
      </div>

      <div className="debug-body">
        <div className="debug-sidebar">
          <TileEditor tiles={tiles} onChange={setTiles} />

          <div className="debug-params">
            <h3>Sim Parameters</h3>
            {(["gravity", "aspect", "damping", "dropDistance", "iterations"] as const).map((key) => (
              <label key={key} className="debug-param-row">
                <span>{key}</span>
                <input
                  type="number"
                  step={key === "iterations" ? 10 : 0.01}
                  value={params[key]}
                  onChange={(e) => setParams((p) => ({ ...p, [key]: +e.target.value }))}
                />
              </label>
            ))}
          </div>

          {currentStep && (
            <div className="debug-step-info">
              <h3>Step {stepIdx}</h3>
              <pre className="debug-desc">{currentStep.subSteps[subStepIdx]?.description}</pre>
            </div>
          )}
        </div>

        <div className="debug-canvas-area">
          <canvas ref={canvasRef} className="debug-canvas" />

          <div className="debug-controls">
            <button onClick={() => setPlaying(!playing)}>
              {playing ? "\u25A0 Stop" : "\u25B6 Play"}
            </button>
            <button
              onClick={() => {
                if (stepIdx > 0) {
                  setStepIdx(stepIdx - 1);
                  setSubStepIdx(0);
                }
              }}
            >
              &larr; Prev Step
            </button>
            <button
              onClick={() => {
                if (trace && stepIdx < trace.steps.length - 1) {
                  setStepIdx(stepIdx + 1);
                  setSubStepIdx(0);
                }
              }}
            >
              Next Step &rarr;
            </button>
          </div>

          <div className="debug-timelines">
            <div className="debug-timeline-row">
              <label>Step ({stepIdx}/{Math.max(0, totalSteps - 1)})</label>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={stepIdx}
                onChange={handleStepChange}
              />
            </div>
            <div className="debug-timeline-row">
              <label>Sub ({subStepIdx}/{Math.max(0, totalSubSteps - 1)})</label>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalSubSteps - 1)}
                value={subStepIdx}
                onChange={handleSubStepChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
