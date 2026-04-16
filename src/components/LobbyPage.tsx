import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "../types/auth";

interface ActiveRoom {
  name: string;
  numParticipants: number;
  createdAt: number;
}

interface LobbyPageProps {
  user: SessionUser;
  onJoinRoom: (room: string) => void;
  onLogout: () => void;
}

export default function LobbyPage({ user, onJoinRoom, onLogout }: LobbyPageProps) {
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRoom, setNewRoom] = useState("");
  const [error, setError] = useState("");

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      if (res.ok) {
        setRooms(await res.json());
      }
    } catch {
      // Silently fail on poll errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10_000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRoom.trim();
    if (!name) {
      setError("Enter a room name.");
      return;
    }
    if (name.length > 64) {
      setError("Room name must be 64 characters or fewer.");
      return;
    }
    setError("");
    onJoinRoom(name);
  };

  const handleJoin = (roomName: string) => {
    onJoinRoom(roomName);
  };

  return (
    <div className="page-wrapper">
      <div className="page-card page-card--wide">
        <header className="page-header">
          <div>
            <h1 className="page-title">boom</h1>
            <p className="page-subtitle">video conferencing</p>
          </div>
          <div className="lobby-user">
            {user.avatar && (
              <img
                src={user.avatar}
                alt=""
                className="lobby-avatar"
              />
            )}
            <span className="lobby-username">{user.username}</span>
            <button type="button" className="subtle-link" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="lobby-create">
          <form onSubmit={handleCreate} className="lobby-create-form">
            <input
              type="text"
              className="input"
              placeholder="Room name"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              maxLength={64}
            />
            <button type="submit" className="lobby-join-btn">
              Create & Join
            </button>
          </form>
          {error && <p className="lobby-error">{error}</p>}
        </section>

        <section className="lobby-rooms">
          <h2 className="lobby-rooms-heading">Active Rooms</h2>
          {loading ? (
            <p className="lobby-empty">Loading…</p>
          ) : rooms.length === 0 ? (
            <p className="lobby-empty">No active rooms. Create one above.</p>
          ) : (
            <ul className="lobby-room-list">
              {rooms.map((room) => (
                <li key={room.name} className="lobby-room-row">
                  <span className="lobby-room-name">{room.name}</span>
                  <span className="lobby-room-count">
                    {room.numParticipants} {room.numParticipants === 1 ? "participant" : "participants"}
                  </span>
                  <button
                    type="button"
                    className="lobby-join-btn lobby-join-btn--small"
                    onClick={() => handleJoin(room.name)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
