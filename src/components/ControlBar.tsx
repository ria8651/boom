import {
  useTrackToggle,
  useDisconnectButton,
  useMediaDeviceSelect,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";

interface ControlBarProps {
  chatOpen: boolean;
  onToggleChat: () => void;
  unreadChat: number;
}

export default function ControlBar({ chatOpen, onToggleChat, unreadChat }: ControlBarProps) {
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const disconnect = useDisconnectButton({});
  const { lastMicrophoneError, lastCameraError } = useLocalParticipant();

  const micDevices = useMediaDeviceSelect({ kind: "audioinput" });
  const camDevices = useMediaDeviceSelect({ kind: "videoinput" });

  const micError = lastMicrophoneError != null;
  const camError = lastCameraError != null;

  return (
    <div className="control-bar line-top">
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

      {/* Leave */}
      <button
        {...disconnect.buttonProps}
        className="control-btn control-btn--danger"
      >
        <LeaveIcon />
        <span className="btn-label">Leave</span>
      </button>
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

function LeaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
