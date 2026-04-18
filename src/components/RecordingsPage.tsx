import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRelative } from "../utils/time";
import ErrorBanner from "./ErrorBanner";
import "./AuthPage.css";
import "./LobbyPage.css";
import "./SettingsModal.css";
import "./RecordingsPage.css";

interface Recording {
  filename: string;
  room: string;
  startedAt: number;
  size: number;
  inProgress: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

interface RecordingsPageProps {
  onBack: () => void;
}

export default function RecordingsPage({ onBack }: RecordingsPageProps) {
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Recording | null>(null);
  const playRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setRecordings(await res.json());
    } catch (err) {
      setError(`Couldn't load recordings (${err instanceof Error ? err.message : "unknown error"}).`);
      setRecordings([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byRoom = useMemo(() => {
    if (!recordings) return null;
    const groups = new Map<string, Recording[]>();
    for (const r of recordings) {
      const list = groups.get(r.room) ?? [];
      list.push(r);
      groups.set(r.room, list);
    }
    return Array.from(groups.entries())
      .map(([room, items]) => ({
        room,
        items: items.sort((a, b) => b.startedAt - a.startedAt),
        latest: Math.max(...items.map((i) => i.startedAt)),
      }))
      .sort((a, b) => b.latest - a.latest);
  }, [recordings]);

  const openPlay = (r: Recording) => {
    setPlaying(r);
    queueMicrotask(() => playRef.current?.showModal());
  };
  const closePlay = () => {
    playRef.current?.close();
    setPlaying(null);
  };

  const askDelete = (r: Recording) => {
    setPendingDelete(r);
    queueMicrotask(() => confirmRef.current?.showModal());
  };
  const cancelDelete = () => {
    confirmRef.current?.close();
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(pendingDelete.filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server returned ${res.status}`);
      }
      setRecordings((prev) => prev?.filter((r) => r.filename !== pendingDelete.filename) ?? null);
      setToast(`Deleted ${pendingDelete.filename}`);
      setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setError(`Failed to delete (${err instanceof Error ? err.message : "unknown error"}).`);
    } finally {
      cancelDelete();
    }
  };

  return (
    <main className="page-wrapper">
      <article className="page-card page-card--wide">
        <header className="page-header">
          <div>
            <h1 className="page-title">Recordings</h1>
            <p className="page-subtitle">saved room recordings</p>
          </div>
          <div className="lobby-user">
            <button type="button" className="lobby-logout" onClick={onBack}>
              Back to lobby
            </button>
          </div>
        </header>
        <hr />

        <section className="recordings-list">
          {recordings === null ? (
            <p className="lobby-empty">Loading…</p>
          ) : byRoom && byRoom.length === 0 ? (
            <p className="lobby-empty">No recordings yet.</p>
          ) : (
            byRoom?.map((group) => (
              <div key={group.room} className="recordings-group">
                <h2 className="recordings-group-heading">{group.room}</h2>
                <ul className="lobby-room-list">
                  {group.items.map((r) => (
                    <li key={r.filename} className="lobby-room-row">
                      <span className="lobby-room-name">
                        {formatRelative(r.startedAt)}
                        {r.inProgress && <span className="recordings-inprogress"> · recording…</span>}
                      </span>
                      <span className="lobby-room-count">{formatSize(r.size)}</span>
                      <button
                        type="button"
                        className="lobby-invite-btn"
                        onClick={() => openPlay(r)}
                        disabled={r.inProgress}
                        title={r.inProgress ? "Recording still in progress" : "Play"}
                      >
                        Play
                      </button>
                      <a
                        className="lobby-invite-btn"
                        href={`/api/recordings/${encodeURIComponent(r.filename)}`}
                        download={r.filename}
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="lobby-forget-btn"
                        onClick={() => askDelete(r)}
                        disabled={r.inProgress}
                        aria-label={`Delete ${r.filename}`}
                        title={r.inProgress ? "Recording still in progress" : "Delete"}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <dialog ref={playRef} className="recordings-play-dialog" onClose={closePlay}>
          {playing && (
            <>
              <p className="invite-dialog-message">{playing.filename}</p>
              <video
                className="recordings-video"
                src={`/api/recordings/${encodeURIComponent(playing.filename)}`}
                controls
                autoPlay
                preload="metadata"
              />
              <div className="invite-dialog-actions">
                <button type="button" className="invite-dialog-btn" onClick={closePlay}>
                  Close
                </button>
              </div>
            </>
          )}
        </dialog>

        <dialog ref={confirmRef} className="leave-dialog" onClose={cancelDelete}>
          {pendingDelete && (
            <>
              <p className="leave-dialog-message">
                Delete this recording? This can't be undone.
                <br />
                <code>{pendingDelete.filename}</code>
              </p>
              <div className="leave-dialog-actions">
                <button type="button" className="leave-dialog-btn" onClick={cancelDelete}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="leave-dialog-btn leave-dialog-btn--danger"
                  onClick={confirmDelete}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </dialog>
      </article>

      {error && <ErrorBanner message={error} onDismiss={() => setError("")} variant="toast" />}
      {toast && <ErrorBanner message={toast} onDismiss={() => setToast("")} variant="toast" />}
    </main>
  );
}
