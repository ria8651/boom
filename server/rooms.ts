import { RoomServiceClient } from "livekit-server-sdk";

export interface ActiveRoom {
  name: string;
  numParticipants: number;
  createdAt: number;
}

function getClient(): RoomServiceClient {
  const url = process.env.LIVEKIT_URL ?? "";
  // RoomServiceClient wants an https:// URL, but LIVEKIT_URL is wss://
  const httpUrl = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return new RoomServiceClient(
    httpUrl,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
}

export async function listActiveRooms(): Promise<ActiveRoom[]> {
  const client = getClient();
  const rooms = await client.listRooms();
  return rooms.map((r) => ({
    name: r.name,
    numParticipants: r.numParticipants,
    createdAt: Number(r.creationTime ?? 0),
  }));
}
