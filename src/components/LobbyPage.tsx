import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "../types/auth";
import { forgetRoom, getRecentRooms, type RecentRoom } from "../recentRooms";
import "./AuthPage.css";
import "./LobbyPage.css";
import "./SettingsModal.css";

interface ActiveRoom {
  name: string;
  numParticipants: number;
  createdAt: number;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface LobbyPageProps {
  user: SessionUser;
  onJoinRoom: (room: string) => void;
  onLogout: () => void;
  onError: (message: string) => void;
}

export default function LobbyPage({ user, onJoinRoom, onLogout, onError }: LobbyPageProps) {
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomsFailed, setRoomsFailed] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RecentRoom[]>(() => getRecentRooms(user.username));

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      setRooms(await res.json());
      setRoomsFailed(false);
    } catch (err) {
      setRoomsFailed(true);
      onError(
        `Couldn't reach server (${err instanceof Error ? err.message : "unknown error"}).`,
      );
    } finally {
      setLoading(false);
    }
  }, [onError]);

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

  const handleForget = (roomName: string) => {
    forgetRoom(user.username, roomName);
    setRecent((prev) => prev.filter((r) => r.name !== roomName));
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError(data?.error ?? `Failed to create invite (${res.status})`);
        return;
      }
      const { inviteToken } = await res.json();
      setInviteUrl(`${window.location.origin}/?invite=${inviteToken}`);
      setInviteCopied(false);
      inviteDialogRef.current?.showModal();
    } catch (err) {
      onError(`Failed to create invite (${err instanceof Error ? err.message : "unknown error"}).`);
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

  // Merge active + recent into a single list. Active rooms first (sorted by
  // participant count desc), then closed-but-recent rooms (sorted by recency).
  type Row =
    | { kind: "active"; name: string; numParticipants: number }
    | { kind: "recent"; name: string; lastJoined: number };

  const activeRoomNames = new Set(rooms.map((r) => r.name));
  const rows: Row[] = [
    ...[...rooms]
      .sort((a, b) => b.numParticipants - a.numParticipants)
      .map<Row>((r) => ({ kind: "active", name: r.name, numParticipants: r.numParticipants })),
    ...recent
      .filter((r) => !activeRoomNames.has(r.name))
      .map<Row>((r) => ({ kind: "recent", name: r.name, lastJoined: r.lastJoined })),
  ];

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
          <h2 className="lobby-rooms-heading">Rooms</h2>
          {loading ? (
            <p className="lobby-empty">Loading…</p>
          ) : rows.length === 0 && !roomsFailed ? (
            <p className="lobby-empty">No rooms yet. Create one above.</p>
          ) : rows.length === 0 ? (
            null
          ) : (
            <ul className="lobby-room-list">
              {rows.map((row) => (
                <li key={`${row.kind}-${row.name}`} className="lobby-room-row">
                  <span className="lobby-room-name">{row.name}</span>
                  {row.kind === "active" ? (
                    <span className="lobby-room-count">
                      {row.numParticipants} {row.numParticipants === 1 ? "participant" : "participants"}
                    </span>
                  ) : (
                    <span className="lobby-room-count">{formatRelative(row.lastJoined)}</span>
                  )}
                  {row.kind === "recent" ? (
                    <button
                      type="button"
                      className="lobby-forget-btn"
                      onClick={() => handleForget(row.name)}
                      aria-label={`Forget ${row.name}`}
                      title="Remove from history"
                    >
                      ×
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="lobby-invite-btn"
                      onClick={() => handleShowInvite(row.name)}
                    >
                      Invite
                    </button>
                  )}
                  <button
                    type="button"
                    className="lobby-join-btn lobby-join-btn--small"
                    onClick={() => handleJoin(row.name)}
                  >
                    {row.kind === "active" ? "Join" : "Reopen"}
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
