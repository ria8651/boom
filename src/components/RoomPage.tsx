import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { ExternalE2EEKeyProvider, type RoomOptions } from "livekit-client";
import { useMemo, useState } from "react";
import type { ConnectionDetails } from "../types/connection";

interface RoomPageProps {
  connectionDetails: ConnectionDetails;
  onLeave: () => void;
}

const worker =
  typeof Worker !== "undefined"
    ? new Worker(new URL("livekit-client/e2ee-worker", import.meta.url), {
        type: "module",
      })
    : undefined;

export default function RoomPage({ connectionDetails, onLeave }: RoomPageProps) {
  const [keyProvider] = useState(() => new ExternalE2EEKeyProvider());

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

  return (
    <LiveKitRoom
      serverUrl={connectionDetails.serverUrl}
      token={connectionDetails.token}
      connect={true}
      onDisconnected={onLeave}
      options={roomOptions}
      style={{ height: "100%" }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
