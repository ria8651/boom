import { useRef, useImperativeHandle, forwardRef } from "react";
import type { LayoutMode } from "../layout/types.js";
import Dropdown from "./Dropdown";
import "./SettingsModal.css";

export type ContentHint = "" | "text" | "detail" | "motion";

export interface ScreenShareSettings {
  preset: string;
  contentHint: ContentHint;
}

export type ThemeName = "default" | "classic-light" | "terminal" | "material";

interface SettingsModalProps {
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  accent: string | null;
  onAccentChange: (accent: string | null) => void;
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

const themes: { value: ThemeName; label: string; description: string }[] = [
  { value: "default", label: "Classic", description: "Dark slate with cyan accent" },
  { value: "classic-light", label: "Classic Light", description: "Light slate with cyan accent" },
  { value: "terminal", label: "Terminal", description: "Green-phosphor CRT" },
  { value: "material", label: "Material", description: "Material Design purple" },
];

const SettingsModal = forwardRef<SettingsModalHandle, SettingsModalProps>(
  function SettingsModal({ layoutMode, onChange, screenShareSettings, onScreenShareSettingsChange, theme, onThemeChange, accent, onAccentChange }, ref) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    // For the color picker: show the current accent (override or theme default).
    // Re-read computed style each render so switching themes updates the swatch.
    const currentAccent = accent
      ?? (typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#10c2ee"
        : "#10c2ee");

    useImperativeHandle(ref, () => ({
      showModal: () => dialogRef.current?.showModal(),
    }));

    return (
      <dialog ref={dialogRef} className="settings-dialog">
        <form method="dialog">
          <h2 className="settings-title">Settings</h2>

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
              <span className="settings-radio-text">
                <strong className="settings-radio-label">Grid</strong>
                <small className="settings-radio-hint">Clean rows, instant layout</small>
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
              <span className="settings-radio-text">
                <strong className="settings-radio-label">Physics</strong>
                <small className="settings-radio-hint">Gravity-based simulation</small>
              </span>
            </label>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Theme</legend>
            <Dropdown value={theme} options={themes} onChange={onThemeChange} ariaLabel="Theme" />
          </fieldset>

          <fieldset className="settings-section">
            <legend>Accent color</legend>
            <div className="settings-accent-row">
              <input
                type="color"
                className="settings-accent-input"
                value={currentAccent}
                onChange={(e) => onAccentChange(e.target.value)}
                aria-label="Accent color"
              />
              <span className="settings-accent-label">{currentAccent}</span>
              {accent && (
                <button
                  type="button"
                  className="settings-accent-reset"
                  onClick={() => onAccentChange(null)}
                >
                  Reset
                </button>
              )}
            </div>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Screen share quality</legend>
            <div className="settings-dropdown-row">
              <span className="settings-dropdown-label">Resolution / frame rate</span>
              <Dropdown
                value={screenShareSettings.preset}
                options={screenSharePresets}
                onChange={(preset) =>
                  onScreenShareSettingsChange({ ...screenShareSettings, preset })
                }
                ariaLabel="Resolution / frame rate"
              />
            </div>
            <div className="settings-dropdown-row">
              <span className="settings-dropdown-label">Content type</span>
              <Dropdown
                value={screenShareSettings.contentHint}
                options={contentHints}
                onChange={(contentHint) =>
                  onScreenShareSettingsChange({ ...screenShareSettings, contentHint: contentHint as ContentHint })
                }
                ariaLabel="Content type"
              />
            </div>
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
