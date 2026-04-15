import { LiveKitRoom, RoomAudioRenderer, useChat, useParticipants } from "@livekit/components-react";
import {
  DisconnectReason,
  ExternalE2EEKeyProvider,
  MediaDeviceFailure,
  ScreenSharePresets,
  type RoomOptions,
} from "livekit-client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConnectionDetails } from "../types/connection";
import type { LayoutMode } from "../layout/types.js";
import ErrorBanner from "./ErrorBanner";
import VideoGrid from "./VideoGrid";
import ControlBar from "./ControlBar";
import ChatPanel from "./ChatPanel";
import PipContent from "./PipContent";
import { usePictureInPicture } from "../hooks/usePictureInPicture";

interface RoomPageProps {
  connectionDetails: ConnectionDetails;
  onLeave: (message?: string) => void;
}

const worker =
  typeof Worker !== "undefined"
    ? new Worker(new URL("livekit-client/e2ee-worker", import.meta.url), {
        type: "module",
      })
    : undefined;

function RoomInterior({
  chatOpen,
  setChatOpen,
  roomError,
  setRoomError,
  layoutMode,
  onLayoutModeChange,
}: {
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  roomError: string;
  setRoomError: (msg: string) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}) {
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
                pipSupported={pip.isSupported}
                pipActive={pip.isActive}
                onTogglePip={pip.isActive ? pip.close : pip.open}
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
  const [keyProvider] = useState(() => new ExternalE2EEKeyProvider());
  const [roomError, setRoomError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    () => (localStorage.getItem("boom-layout-mode") as LayoutMode) ?? "grid",
  );
  const handleLayoutModeChange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem("boom-layout-mode", mode);
  }, []);

  useMemo(() => {
    keyProvider.setKey(connectionDetails.password);
  }, [keyProvider, connectionDetails.password]);

  const roomOptions = useMemo((): RoomOptions => {
    const opts: RoomOptions = {
      // Don't auto-disconnect on beforeunload — we handle this ourselves
      // so the browser's "Leave site?" Cancel button actually works.
      disconnectOnPageLeave: false,
      publishDefaults: {
        screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
      },
    };
    if (worker) {
      opts.e2ee = { keyProvider, worker };
    }
    return opts;
  }, [keyProvider]);

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

  const handleEncryptionError = useCallback((error: Error) => {
    setRoomError(
      `End-to-end encryption error: ${error.message}. ` +
      "Make sure all participants are using the same password.",
    );
  }, []);

  return (
    <LiveKitRoom
      serverUrl={connectionDetails.serverUrl}
      token={connectionDetails.token}
      connect={true}
      onDisconnected={handleDisconnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      onEncryptionError={handleEncryptionError}
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
      />
    </LiveKitRoom>
  );
}
