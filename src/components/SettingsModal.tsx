import { useRef, useImperativeHandle, forwardRef } from "react";
import type { LayoutMode } from "../layout/types.js";

export interface ScreenShareSettings {
  preset: string;
  contentHint: string;
}

interface SettingsModalProps {
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
}

export interface SettingsModalHandle {
  showModal: () => void;
}

const screenSharePresets = [
  { value: "h360fps3", label: "360p @ 3 fps", description: "Minimal bandwidth" },
  { value: "h360fps15", label: "360p @ 15 fps", description: "Low bandwidth" },
  { value: "h720fps5", label: "720p @ 5 fps", description: "Slides / static content" },
  { value: "h720fps15", label: "720p @ 15 fps", description: "Balanced" },
  { value: "h720fps30", label: "720p @ 30 fps", description: "Smooth motion" },
  { value: "h720fps60", label: "720p @ 60 fps", description: "Gaming / high motion" },
  { value: "h1080fps15", label: "1080p @ 15 fps", description: "High detail, low motion" },
  { value: "h1080fps30", label: "1080p @ 30 fps", description: "Default" },
  { value: "h1080fps60", label: "1080p @ 60 fps", description: "High detail + smooth" },
  { value: "original", label: "Original resolution", description: "Native res @ 30 fps" },
] as const;

const contentHints = [
  { value: "", label: "Auto", description: "Browser decides" },
  { value: "text", label: "Text / slides", description: "Optimise for sharpness" },
  { value: "detail", label: "Detail", description: "Preserve fine detail" },
  { value: "motion", label: "Motion / video", description: "Optimise for smoothness" },
] as const;

const SettingsModal = forwardRef<SettingsModalHandle, SettingsModalProps>(
  function SettingsModal({ layoutMode, onChange, screenShareSettings, onScreenShareSettingsChange }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useImperativeHandle(ref, () => ({
      showModal: () => dialogRef.current?.showModal(),
    }));

    return (
      <dialog ref={dialogRef} className="settings-dialog">
        <form method="dialog">
          <h2>Settings</h2>

          <fieldset className="settings-section">
            <legend>Layout mode</legend>
            <label className="settings-radio">
              <input
                type="radio"
                name="layout-mode"
                value="grid"
                checked={layoutMode === "grid"}
                onChange={() => onChange("grid")}
              />
              <span>
                <strong>Grid</strong>
                <small>Clean rows, instant layout</small>
              </span>
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="layout-mode"
                value="physics"
                checked={layoutMode === "physics"}
                onChange={() => onChange("physics")}
              />
              <span>
                <strong>Physics</strong>
                <small>Gravity-based simulation</small>
              </span>
            </label>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Screen share quality</legend>
            <label className="settings-select-label">
              Resolution / frame rate
              <select
                className="settings-select"
                value={screenShareSettings.preset}
                onChange={(e) =>
                  onScreenShareSettingsChange({ ...screenShareSettings, preset: e.target.value })
                }
              >
                {screenSharePresets.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-select-label">
              Content type
              <select
                className="settings-select"
                value={screenShareSettings.contentHint}
                onChange={(e) =>
                  onScreenShareSettingsChange({ ...screenShareSettings, contentHint: e.target.value })
                }
              >
                {contentHints.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label} — {h.description}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <button type="submit" className="settings-close-btn">
            Done
          </button>
        </form>
      </dialog>
    );
  },
);

export default SettingsModal;
