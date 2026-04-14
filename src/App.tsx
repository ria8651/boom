import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import PreJoinPage from "./components/PreJoinPage";
import RoomPage from "./components/RoomPage";

const SESSION_KEY = "boom:session";

function loadSession(): ConnectionDetails | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.serverUrl && parsed.token && parsed.password && parsed.room && parsed.identity) {
      return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return null;
}

function saveSession(session: ConnectionDetails) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

async function refreshToken(session: ConnectionDetails): Promise<ConnectionDetails | null> {
  try {
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: session.room,
        identity: session.identity,
        password: session.password,
      }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const { token, serverUrl } = await res.json();
    const newSession: ConnectionDetails = { ...session, token, serverUrl };
    saveSession(newSession);
    return newSession;
  } catch {
    clearSession();
    return null;
  }
}

function App() {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(true);

  // Warn before closing the tab while in an active session
  useEffect(() => {
    if (!connectionDetails) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [connectionDetails]);

  // On mount, try to restore session with a fresh token
  useEffect(() => {
    const session = loadSession();
    if (!session) {
      setRestoring(false);
      return;
    }
    refreshToken(session).then((details) => {
      if (details) setConnectionDetails(details);
      setRestoring(false);
    });
  }, []);

  const handleLeave = useCallback((message?: string) => {
    clearSession();
    setConnectionDetails(null);
    setError(message ?? "");
  }, []);

  const handleJoin = useCallback((details: ConnectionDetails) => {
    saveSession(details);
    setError("");
    setConnectionDetails(details);
  }, []);

  if (restoring) return null;

  return (
    <div style={{ height: "100%" }}>
      {connectionDetails ? (
        <RoomPage
          connectionDetails={connectionDetails}
          onLeave={handleLeave}
        />
      ) : (
        <PreJoinPage
          onJoin={handleJoin}
          error={error}
          onError={setError}
        />
      )}
    </div>
  );
}

export default App;
