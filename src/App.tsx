import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import type { SessionUser } from "./types/auth";
import AuthPage from "./components/AuthPage";
import LobbyPage from "./components/LobbyPage";
import RoomPage from "./components/RoomPage";
import SimDebugPage from "./components/SimDebugPage";
import "./styles/debug.css";

const SESSION_KEY = "boom:session";


function loadSession(): ConnectionDetails | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.serverUrl && parsed.token && parsed.room && parsed.identity) {
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

type AppView = "loading" | "auth" | "lobby" | "room";

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState("");
  const [, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Warn before closing the tab while in an active room
  useEffect(() => {
    if (view !== "room") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [view]);

  // On mount: check auth, then optionally restore room session
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setView("auth");
          return;
        }
        const me: SessionUser = await res.json();
        setUser(me);

        // Try restoring an active room session
        const session = loadSession();
        if (session) {
          // Refresh the LiveKit token
          try {
            const tokenRes = await fetch("/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room: session.room }),
            });
            if (tokenRes.ok) {
              const { token, serverUrl, identity } = await tokenRes.json();
              const restored: ConnectionDetails = {
                ...session,
                token,
                serverUrl,
                identity,
              };
              saveSession(restored);
              setConnectionDetails(restored);
              setView("room");
              return;
            }
          } catch {
            // Token refresh failed, fall through to lobby
          }
          clearSession();
        }

        setView("lobby");
      } catch {
        setView("auth");
      }
    })();
  }, []);

  const handleJoinRoom = useCallback(async (room: string) => {
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Failed to join room (${res.status})`);
        return;
      }

      const { token, serverUrl, identity } = await res.json();
      const details: ConnectionDetails = {
        serverUrl,
        token,
        room,
        identity,
      };
      saveSession(details);
      setError("");
      setConnectionDetails(details);
      setView("room");
    } catch (err) {
      setError(
        `Could not reach the server. (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }, [user]);

  const handleLeave = useCallback((message?: string) => {
    clearSession();
    setConnectionDetails(null);
    setError(message ?? "");
    setView("lobby");
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setConnectionDetails(null);
    setUser(null);
    setView("auth");
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  if (view === "loading") return null;

  // /debug route — simulation debugger
  if (window.location.pathname === "/debug") {
    return (
      <SimDebugPage
        onBack={() => {
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      />
    );
  }

  if (view === "auth") {
    return <AuthPage />;
  }

  if (view === "room" && connectionDetails) {
    return (
      <div style={{ height: "100%" }}>
        <RoomPage
          connectionDetails={connectionDetails}
          onLeave={handleLeave}
        />
      </div>
    );
  }

  // Lobby (default for authenticated users)
  return (
    <div style={{ height: "100%" }}>
      <LobbyPage
        user={user!}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
      />
      {error && (
        <div className="error-banner error-banner--toast">{error}</div>
      )}
    </div>
  );
}

export default App;
