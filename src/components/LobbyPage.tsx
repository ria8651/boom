import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "../types/auth";
import "./AuthPage.css";
import "./LobbyPage.css";
import "./SettingsModal.css";

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

  const inviteDialogRef = useRef<HTMLDialogElement>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleShowInvite = async (roomName: string) => {
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName }),
      });
      if (!res.ok) return;
      const { inviteToken } = await res.json();
      setInviteUrl(`${window.location.origin}/?invite=${inviteToken}`);
      setInviteCopied(false);
      inviteDialogRef.current?.showModal();
    } catch {
      // Silently fail
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = inviteUrl;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setInviteCopied(true);
  };

  return (
    <main className="page-wrapper">
      <article className="page-card page-card--wide">
        <header className="page-header">
          <div>
            <h1 className="page-title">boom</h1>
            <p className="page-subtitle">video conferencing</p>
          </div>
          <div className="lobby-user">
            {user.avatar && (
              <img src={user.avatar} alt="" className="lobby-avatar" />
            )}
            <span className="lobby-username">{user.username}</span>
            <button type="button" className="lobby-logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="lobby-create">
          <form onSubmit={handleCreate} className="lobby-create-form">
            <input
              type="text"
              className="lobby-input"
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
                    className="lobby-invite-btn"
                    onClick={() => handleShowInvite(room.name)}
                  >
                    Invite
                  </button>
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

        <dialog ref={inviteDialogRef} className="invite-dialog">
          <p className="invite-dialog-message">Share this link to invite someone:</p>
          <input
            type="text"
            className="invite-url-input"
            value={inviteUrl}
            readOnly
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <div className="invite-dialog-actions">
            <button className="invite-dialog-btn" onClick={() => inviteDialogRef.current?.close()}>Close</button>
            <button className="invite-dialog-btn invite-dialog-btn--primary" onClick={handleCopyInvite}>
              {inviteCopied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </dialog>
      </article>
    </main>
  );
}
