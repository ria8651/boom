import { LiveKitRoom, RoomAudioRenderer, useChat } from "@livekit/components-react";
import {
  DisconnectReason,
  ExternalE2EEKeyProvider,
  MediaDeviceFailure,
  type RoomOptions,
} from "livekit-client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConnectionDetails } from "../types/connection";
import ErrorBanner from "./ErrorBanner";
import VideoGrid from "./VideoGrid";
import ControlBar from "./ControlBar";
import ChatPanel from "./ChatPanel";

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
}: {
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  roomError: string;
  setRoomError: (msg: string) => void;
}) {
  const { chatMessages } = useChat();
  const [unreadChat, setUnreadChat] = useState(0);
  const prevCountRef = useRef(chatMessages.length);
  const contentRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });

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
              <VideoGrid containerWidth={gridSize.width} containerHeight={gridSize.height} />
            </div>
            <div className="room-bottom">
              {roomError && <ErrorBanner message={roomError} onDismiss={() => setRoomError("")} />}
              <ControlBar
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((c) => !c)}
                unreadChat={unreadChat}
              />
            </div>
          </div>
          {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} onError={setRoomError} />}
        </div>
      </div>
      <RoomAudioRenderer />
    </>
  );
}

export default function RoomPage({ connectionDetails, onLeave }: RoomPageProps) {
  const [keyProvider] = useState(() => new ExternalE2EEKeyProvider());
  const [roomError, setRoomError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useMemo(() => {
    keyProvider.setKey(connectionDetails.password);
  }, [keyProvider, connectionDetails.password]);

  const roomOptions = useMemo((): RoomOptions => {
    if (!worker) return {};
    return {
      e2ee: {
        keyProvider,
        worker,
      },
    };
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
      />
    </LiveKitRoom>
  );
}
