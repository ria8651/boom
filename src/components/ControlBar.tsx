import {
  useTrackToggle,
  useDisconnectButton,
  useMediaDeviceSelect,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LayoutMode } from "../layout/types.js";
import SettingsModal, { type SettingsModalHandle, type ScreenShareSettings } from "./SettingsModal.js";

interface ControlBarProps {
  chatOpen: boolean;
  onToggleChat: () => void;
  unreadChat: number;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
  pipSupported?: boolean;
  pipActive?: boolean;
  onTogglePip?: () => void;
  recording?: boolean;
  recordingPending?: boolean;
  onToggleRecording?: () => void;
}

export default function ControlBar({ chatOpen, onToggleChat, unreadChat, layoutMode, onLayoutModeChange, screenShareSettings, onScreenShareSettingsChange, pipSupported, pipActive, onTogglePip, recording, recordingPending, onToggleRecording }: ControlBarProps) {
  const settingsRef = useRef<SettingsModalHandle>(null);
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });

  // Persist mic/cam state so it survives rejoin
  useEffect(() => { localStorage.setItem("boom-mic-enabled", String(mic.enabled)); }, [mic.enabled]);
  useEffect(() => { localStorage.setItem("boom-cam-enabled", String(cam.enabled)); }, [cam.enabled]);
  const screenCaptureOptions = useMemo(() => ({
    audio: true,
    contentHint: screenShareSettings.contentHint || undefined,
  } as const), [screenShareSettings.contentHint]);
  const screen = useTrackToggle({ source: Track.Source.ScreenShare, captureOptions: screenCaptureOptions });
  const disconnect = useDisconnectButton({});
  const leaveDialogRef = useRef<HTMLDialogElement>(null);
  const { lastMicrophoneError, lastCameraError } = useLocalParticipant();

  const micDevices = useMediaDeviceSelect({ kind: "audioinput" });
  const camDevices = useMediaDeviceSelect({ kind: "videoinput" });

  const micError = lastMicrophoneError != null;
  const camError = lastCameraError != null;

  // Auto-collapse labels when buttons would overflow
  const barRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const check = () => {
      // Temporarily show full labels to measure natural width
      const wasCompact = el.classList.contains("control-bar--compact");
      if (wasCompact) el.classList.remove("control-bar--compact");
      const fullWidth = el.scrollWidth;
      const available = el.clientWidth;
      if (wasCompact) el.classList.add("control-bar--compact");
      setCompact(fullWidth > available + 1);
    };
    check();
    // Re-check on resize and on DOM changes (button text/count changes)
    const resizeObs = new ResizeObserver(check);
    resizeObs.observe(el);
    const mutationObs = new MutationObserver(check);
    mutationObs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { resizeObs.disconnect(); mutationObs.disconnect(); };
  }, []);

  return (
    <div ref={barRef} className={`control-bar line-top${compact ? " control-bar--compact" : ""}`}>
      {/* Microphone */}
      <MediaButton
        toggle={mic}
        error={micError}
        errorMessage={lastMicrophoneError?.message}
        enabledIcon={<MicIcon />}
        disabledIcon={<MicOffIcon />}
        label="Mic"
        errorLabel="Mic blocked"
        devices={micDevices}
        deviceLabel="Select microphone"
      />

      {/* Camera */}
      <MediaButton
        toggle={cam}
        error={camError}
        errorMessage={lastCameraError?.message}
        enabledIcon={<CamIcon />}
        disabledIcon={<CamOffIcon />}
        label="Camera"
        errorLabel="Cam blocked"
        devices={camDevices}
        deviceLabel="Select camera"
      />

      {/* Screen share */}
      {screen.pending ? (
        <button className="control-btn control-btn--pending" disabled>
          <SpinnerIcon />
          <span className="btn-label">Share…</span>
        </button>
      ) : (
        <button
          className={`control-btn${screen.enabled ? " control-btn--sharing" : ""}`}
          onClick={() => screen.toggle()}
        >
          <ScreenIcon />
          <span className="btn-label">{screen.enabled ? "Stop sharing" : "Share"}</span>
        </button>
      )}

      {/* Chat */}
      <button
        className={`control-btn control-btn--chat${chatOpen ? " control-btn--active" : ""}`}
        onClick={onToggleChat}
      >
        <ChatIcon />
        <span className="btn-label">Chat</span>
        {unreadChat > 0 && <span className="chat-badge">{unreadChat}</span>}
      </button>

      {/* Settings */}
      <button
        className="control-btn"
        onClick={() => settingsRef.current?.showModal()}
      >
        <SettingsIcon />
        <span className="btn-label">Settings</span>
      </button>

      {/* Picture-in-Picture */}
      {pipSupported && onTogglePip && (
        <button className={`control-btn${pipActive ? " control-btn--active" : ""}`} onClick={onTogglePip}>
          <PipIcon />
          <span className="btn-label">Popout</span>
        </button>
      )}

      {/* Record */}
      {onToggleRecording && (recordingPending ? (
        <button className="control-btn control-btn--pending" disabled>
          <SpinnerIcon />
          <span className="btn-label">Record…</span>
        </button>
      ) : (
        <button
          className={`control-btn${recording ? " control-btn--recording" : ""}`}
          onClick={onToggleRecording}
        >
          <RecordIcon />
          <span className="btn-label">{recording ? "Stop rec" : "Record"}</span>
        </button>
      ))}

      {/* Leave */}
      <button
        className="control-btn control-btn--danger"
        onClick={() => leaveDialogRef.current?.showModal()}
      >
        <LeaveIcon />
        <span className="btn-label">Leave</span>
      </button>
      <dialog ref={leaveDialogRef} className="leave-dialog">
        <p>Leave the room?</p>
        <div className="leave-dialog-actions">
          <button className="leave-dialog-btn" onClick={() => leaveDialogRef.current?.close()}>Cancel</button>
          <button className="leave-dialog-btn leave-dialog-btn--danger" onClick={() => { leaveDialogRef.current?.close(); disconnect.buttonProps.onClick(); }}>Leave</button>
        </div>
      </dialog>

      <SettingsModal ref={settingsRef} layoutMode={layoutMode} onChange={onLayoutModeChange} screenShareSettings={screenShareSettings} onScreenShareSettingsChange={onScreenShareSettingsChange} />
    </div>
  );
}

/* ── Media button (mic/cam with error + pending states) ──────── */

function MediaButton({
  toggle,
  error,
  errorMessage,
  enabledIcon,
  disabledIcon,
  label,
  errorLabel,
  devices,
  deviceLabel,
}: {
  toggle: { enabled: boolean; pending: boolean; toggle: () => void };
  error: boolean;
  errorMessage?: string;
  enabledIcon: React.ReactNode;
  disabledIcon: React.ReactNode;
  label: string;
  errorLabel: string;
  devices: { devices: MediaDeviceInfo[]; activeDeviceId: string; setActiveMediaDevice: (id: string) => Promise<void> };
  deviceLabel: string;
}) {
  if (error) {
    return (
      <button
        className="control-btn control-btn--error"
        onClick={() => toggle.toggle()}
        title={errorMessage}
      >
        <AlertIcon />
        <span className="btn-label">{errorLabel}</span>
      </button>
    );
  }

  if (toggle.pending) {
    return (
      <button className="control-btn control-btn--pending" disabled>
        <SpinnerIcon />
        <span className="btn-label">{label}…</span>
      </button>
    );
  }

  // Only show device select when there are multiple devices with labels
  const labeledDevices = devices.devices.filter((d) => d.label);
  const showSelect = labeledDevices.length > 1;

  const btn = (
    <button
      className={`control-btn${toggle.enabled ? "" : " control-btn--muted"}`}
      onClick={() => toggle.toggle()}
    >
      {toggle.enabled ? enabledIcon : disabledIcon}
      <span className="btn-label">{label}</span>
    </button>
  );

  if (!showSelect) return btn;

  return (
    <div className="control-group">
      {btn}
      <select
        className="device-select"
        value={devices.activeDeviceId}
        onChange={(e) => devices.setActiveMediaDevice(e.target.value)}
        aria-label={deviceLabel}
      >
        {labeledDevices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Icons (16×16 inline SVGs) ───────────────────────────────── */

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spinner-icon">
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zM14.98 11.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9l4.17 4.18L21 19.73 4.27 3z" />
    </svg>
  );
}

function CamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
    </svg>
  );
}


function ScreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
    </svg>
  );
}

function PipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    </svg>
  );
}
