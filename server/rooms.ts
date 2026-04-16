import { RoomServiceClient } from "livekit-server-sdk";

export interface ActiveRoom {
  name: string;
  numParticipants: number;
  createdAt: number;
}

export function getLiveKitHttpUrl(): string {
  const url = process.env.LIVEKIT_URL ?? "";
  // LiveKit clients want an https:// URL, but LIVEKIT_URL is wss://
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
