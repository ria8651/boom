import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import {
  DisconnectReason,
  ExternalE2EEKeyProvider,
  MediaDeviceFailure,
  type RoomOptions,
} from "livekit-client";
import { useCallback, useMemo, useState } from "react";
import type { ConnectionDetails } from "../types/connection";
import ErrorBanner from "./ErrorBanner";

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

export default function RoomPage({ connectionDetails, onLeave }: RoomPageProps) {
  const [keyProvider] = useState(() => new ExternalE2EEKeyProvider());
  const [roomError, setRoomError] = useState("");

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
          "This usually means the server is unreachable, the API key/secret is wrong, or the URL is incorrect. " +
          "Check the LiveKit server logs for details.",
      };
      onLeave(
        messages[reason as DisconnectReason] ??
          `Lost connection to the room (reason: ${reason ?? "unknown"}). Check your network and try again.`,
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
      {roomError && <ErrorBanner message={roomError} onDismiss={() => setRoomError("")} />}
      <VideoConference />
    </LiveKitRoom>
  );
}
