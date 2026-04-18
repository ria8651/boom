import { RoomServiceClient } from "livekit-server-sdk";

export interface ActiveRoom {
  name: string;
  numParticipants: number;
  createdAt: number;
}

// Default for an all-on-localhost dev stack. Both code paths (server-side
// HTTP via getLiveKitHttpUrl and the browser-facing URL handed out by
// /api/token) fall back to this when nothing is configured.
const DEFAULT_LIVEKIT_URL = "ws://localhost:7880";

export function getLiveKitWsUrl(): string {
  return process.env.LIVEKIT_URL ?? DEFAULT_LIVEKIT_URL;
}

export function getLiveKitHttpUrl(): string {
  // LIVEKIT_SERVER_URL is the in-cluster URL boom uses for server-side HTTP
  // calls (docker DNS in compose, e.g. ws://livekit:7880). Falls back to the
  // browser-facing LIVEKIT_URL for setups where the two are the same (host
  // dev, single-URL production).
  const url = process.env.LIVEKIT_SERVER_URL ?? getLiveKitWsUrl();
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export function getRoomServiceClient(): RoomServiceClient {
  return new RoomServiceClient(
    getLiveKitHttpUrl(),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
}

export async function listActiveRooms(): Promise<ActiveRoom[]> {
  const client = getRoomServiceClient();
  const rooms = await client.listRooms();
  return rooms.map((r) => ({
    name: r.name,
    numParticipants: r.numParticipants,
    createdAt: Number(r.creationTime ?? 0),
  }));
}
