import { LiveKitRoom, RoomAudioRenderer, useChat, useParticipants, useRoomContext, useRoomInfo } from "@livekit/components-react";
import {
  DisconnectReason,
  MediaDeviceFailure,
  ScreenSharePresets,
  VideoPreset,
  type RoomOptions,
} from "livekit-client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConnectionDetails } from "../types/connection";
import type { LayoutMode } from "../layout/types.js";
import type { ScreenShareSettings } from "./SettingsModal.js";
import ErrorBanner from "./ErrorBanner";
import VideoGrid from "./VideoGrid";
import ControlBar from "./ControlBar";
import ChatPanel from "./ChatPanel";
import PipContent from "./PipContent";
import { usePictureInPicture } from "../hooks/usePictureInPicture";

const customScreenSharePresets: Record<string, VideoPreset> = {
  h720fps60: new VideoPreset(1280, 720, 3_000_000, 60, "medium"),
  h1080fps60: new VideoPreset(1920, 1080, 8_000_000, 60, "medium"),
};

function resolveScreenSharePreset(key: string): VideoPreset {
  return customScreenSharePresets[key]
    ?? ScreenSharePresets[key as keyof typeof ScreenSharePresets]
    ?? ScreenSharePresets.h1080fps30;
}

interface RoomPageProps {
  connectionDetails: ConnectionDetails;
  onLeave: (message?: string) => void;
}


function RoomInterior({
  chatOpen,
  setChatOpen,
  roomError,
  setRoomError,
  layoutMode,
  onLayoutModeChange,
  screenShareSettings,
  onScreenShareSettingsChange,
  roomName,
}: {
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  roomError: string;
  setRoomError: (msg: string) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  screenShareSettings: ScreenShareSettings;
  onScreenShareSettingsChange: (settings: ScreenShareSettings) => void;
  roomName: string;
}) {
  const room = useRoomContext();
  const { metadata } = useRoomInfo();
  const recording = (() => {
    try { return JSON.parse(metadata ?? "{}").recording === true; } catch { return false; }
  })();
  const [recordingPending, setRecordingPending] = useState(false);

  const handleToggleRecording = useCallback(async () => {
    setRecordingPending(true);
    try {
      const endpoint = recording ? "/api/recordings/stop" : "/api/recordings/start";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setRoomError(data.error ?? "Recording request failed");
      }
    } catch {
      setRoomError("Failed to reach server for recording");
    } finally {
      setRecordingPending(false);
    }
  }, [recording, roomName, setRoomError]);
  // Update screen share encoding on the live room without triggering a reconnect
  useEffect(() => {
    if (room.options.publishDefaults) {
      room.options.publishDefaults.screenShareEncoding = resolveScreenSharePreset(screenShareSettings.preset).encoding;
    }
  }, [room, screenShareSettings.preset]);

  const { chatMessages } = useChat();
  const [unreadChat, setUnreadChat] = useState(0);
  const prevCountRef = useRef(chatMessages.length);
  const contentRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const pip = usePictureInPicture();

  // Track participant join/leave for system messages
  const participants = useParticipants();
  const [systemMessages, setSystemMessages] = useState<{ id: string; text: string; timestamp: number }[]>([]);
  const prevParticipantIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(participants.map((p) => p.identity));
    const prevIds = prevParticipantIds.current;

    // Skip the first render (initial participant list)
    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          const p = participants.find((pp) => pp.identity === id);
          const name = p?.name || id;
          setSystemMessages((prev) => [...prev, {
            id: `join-${id}-${Date.now()}`,
            text: `${name} joined`,
            timestamp: Date.now(),
          }]);
        }
      }
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          setSystemMessages((prev) => [...prev, {
            id: `leave-${id}-${Date.now()}`,
            text: `${id} left`,
            timestamp: Date.now(),
          }]);
        }
      }
    }

    prevParticipantIds.current = currentIds;
  }, [participants]);

  useEffect(() => {
    const newMessages = chatMessages.length - prevCountRef.current;
    if (newMessages > 0 && !chatOpen) {
      setUnreadChat((c) => c + newMessages);
    }
    prevCountRef.current = chatMessages.length;
  }, [chatMessages.length, chatOpen]);

  useEffect(() => {
    if (chatOpen) setUnreadChat(0);
  }, [chatOpen]);

  // Measure grid area — useLayoutEffect for synchronous reads on state
  // changes (chat open, error), ResizeObserver for window resizes
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setGridSize({ width: el.clientWidth, height: el.clientHeight });
  }, [chatOpen, roomError]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setGridSize({ width: el.clientWidth, height: el.clientHeight });
    measure(); // initial measurement
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="room">
        <div className="room-main">
          <div className="room-content">
            {recording && (
              <div className="recording-banner">
                <span className="recording-dot" />
                Recording
              </div>
            )}
            <div className="grid-area" ref={contentRef}>
              <VideoGrid containerWidth={gridSize.width} containerHeight={gridSize.height} layoutMode={layoutMode} />
            </div>
            <div className="room-bottom">
              {roomError && <ErrorBanner message={roomError} onDismiss={() => setRoomError("")} />}
              <ControlBar
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((c) => !c)}
                unreadChat={unreadChat}
                layoutMode={layoutMode}
                onLayoutModeChange={onLayoutModeChange}
                screenShareSettings={screenShareSettings}
                onScreenShareSettingsChange={onScreenShareSettingsChange}
                pipSupported={pip.isSupported}
                pipActive={pip.isActive}
                onTogglePip={pip.isActive ? pip.close : pip.open}
                recording={recording}
                recordingPending={recordingPending}
                onToggleRecording={handleToggleRecording}
              />
            </div>
          </div>
          <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} onError={setRoomError} systemMessages={systemMessages} />
        </div>
      </div>
      <RoomAudioRenderer />
      {pip.pipWindow && <PipContent pipWindow={pip.pipWindow} layoutMode={layoutMode} />}
    </>
  );
}

export default function RoomPage({ connectionDetails, onLeave }: RoomPageProps) {
  const [roomError, setRoomError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    () => (localStorage.getItem("boom-layout-mode") as LayoutMode) ?? "grid",
  );
  const handleLayoutModeChange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem("boom-layout-mode", mode);
  }, []);

  const [screenShareSettings, setScreenShareSettings] = useState<ScreenShareSettings>(() => {
    const stored = localStorage.getItem("boom-screenshare-settings");
    if (stored) {
      try { return JSON.parse(stored); } catch { /* fall through */ }
    }
    return { preset: "h1080fps30", contentHint: "" };
  });
  const handleScreenShareSettingsChange = useCallback((settings: ScreenShareSettings) => {
    setScreenShareSettings(settings);
    localStorage.setItem("boom-screenshare-settings", JSON.stringify(settings));
  }, []);

  const roomOptions = useMemo((): RoomOptions => ({
    disconnectOnPageLeave: false,
    publishDefaults: {
      screenShareEncoding: resolveScreenSharePreset(screenShareSettings.preset).encoding,
      dtx: false,
    },
  }), [screenShareSettings.preset]);

  const handleDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.CLIENT_INITIATED) {
        onLeave();
        return;
      }

      const messages: Partial<Record<DisconnectReason, string>> = {
        [DisconnectReason.DUPLICATE_IDENTITY]:
          "Someone else joined with the same display name. Choose a different name and try again.",
        [DisconnectReason.PARTICIPANT_REMOVED]:
          "You were removed from the room by another participant.",
        [DisconnectReason.ROOM_DELETED]:
          "The room has been closed by the server.",
        [DisconnectReason.JOIN_FAILURE]:
          `Could not connect to the LiveKit server at ${connectionDetails.serverUrl}. ` +
          "This usually means the server is unreachable, the API key/secret is wrong, the URL is incorrect, " +
          "or you're connecting over HTTP instead of HTTPS (required for WebRTC).",
      };
      onLeave(
        messages[reason as DisconnectReason] ??
          `Lost connection to the room (reason: ${reason ?? "unknown"}). Check your network connection and ensure you're using HTTPS.`,
      );
    },
    [onLeave, connectionDetails.serverUrl],
  );

  const handleError = useCallback((error: Error) => {
    setRoomError(`${error.name}: ${error.message}`);
  }, []);

  const handleMediaDeviceFailure = useCallback(
    (failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
      const device = kind === "audioinput" ? "Microphone"
        : kind === "videoinput" ? "Camera"
        : kind === "audiooutput" ? "Speaker"
        : "Device";

      if (failure === MediaDeviceFailure.PermissionDenied) {
        setRoomError(`${device} access was denied. Check your browser's site permissions and allow access.`);
      } else if (failure === MediaDeviceFailure.NotFound) {
        setRoomError(`No ${device.toLowerCase()} found. Make sure one is connected and not disabled in your system settings.`);
      } else if (failure === MediaDeviceFailure.DeviceInUse) {
        setRoomError(`${device} is being used by another application. Close the other app and try again.`);
      } else {
        setRoomError(`${device} is unavailable (${failure ?? "unknown error"}).`);
      }
    },
    [],
  );


  return (
    <LiveKitRoom
      serverUrl={connectionDetails.serverUrl}
      token={connectionDetails.token}
      connect={true}
      audio={localStorage.getItem("boom-mic-enabled") !== "false"}
      video={localStorage.getItem("boom-cam-enabled") !== "false"}
      onDisconnected={handleDisconnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      options={roomOptions}
      style={{ height: "100%" }}
    >
      <RoomInterior
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        roomError={roomError}
        setRoomError={setRoomError}
        layoutMode={layoutMode}
        onLayoutModeChange={handleLayoutModeChange}
        screenShareSettings={screenShareSettings}
        onScreenShareSettingsChange={handleScreenShareSettingsChange}
        roomName={connectionDetails.room}
      />
    </LiveKitRoom>
  );
}
