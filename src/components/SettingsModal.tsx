import { useRef, useImperativeHandle, forwardRef } from "react";
import type { LayoutMode } from "../layout/types.js";

interface SettingsModalProps {
  layoutMode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

export interface SettingsModalHandle {
  showModal: () => void;
}

const SettingsModal = forwardRef<SettingsModalHandle, SettingsModalProps>(
  function SettingsModal({ layoutMode, onChange }, ref) {
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

          <button type="submit" className="settings-close-btn">
            Done
          </button>
        </form>
      </dialog>
    );
  },
);

export default SettingsModal;
