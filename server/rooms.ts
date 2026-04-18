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

// Used to authorize actions that assume the caller has legitimate access to
// the room (e.g. minting invite tokens). A user with a LiveKit JWT for a room
// is only "in" the room once they actually connect — holding a token alone is
// not enough to imply authorization.
export async function isRoomParticipant(room: string, identity: string): Promise<boolean> {
  try {
    const participants = await getRoomServiceClient().listParticipants(room);
    return participants.some((p) => p.identity === identity);
  } catch {
    // listParticipants throws if the room doesn't exist — treat as "not in it".
    return false;
  }
}
