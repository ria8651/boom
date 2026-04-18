// Per-user list of recently joined rooms, persisted to localStorage.
// Keyed on the authenticated identity so users don't see each other's history
// on a shared device.

export interface RecentRoom {
  name: string;
  lastJoined: number;
}

const MAX_RECENT = 8;

function key(username: string): string {
  return `boom:recent-rooms:${username}`;
}

export function getRecentRooms(username: string): RecentRoom[] {
  try {
    const raw = localStorage.getItem(key(username));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentRoom =>
        r && typeof r.name === "string" && typeof r.lastJoined === "number",
    );
  } catch {
    return [];
  }
}

export function rememberRoom(username: string, roomName: string) {
  const existing = getRecentRooms(username).filter((r) => r.name !== roomName);
  const updated = [{ name: roomName, lastJoined: Date.now() }, ...existing].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(key(username), JSON.stringify(updated));
  } catch {
    // Storage quota or disabled — silently ignore
  }
}

export function forgetRoom(username: string, roomName: string) {
  const updated = getRecentRooms(username).filter((r) => r.name !== roomName);
  try {
    localStorage.setItem(key(username), JSON.stringify(updated));
  } catch {
    // Silently ignore
  }
}
