import { useCallback, useEffect, useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import type { SessionUser } from "./types/auth";
import AuthPage from "./components/AuthPage";
import GuestJoinPage from "./components/GuestJoinPage";
import LobbyPage from "./components/LobbyPage";
import RecordingsPage from "./components/RecordingsPage";
import RoomPage from "./components/RoomPage";
import SimDebugPage from "./components/SimDebugPage";
import ErrorBanner from "./components/ErrorBanner";
import { rememberRoom } from "./recentRooms";
import type { ThemeName } from "./components/SettingsModal";
import "./styles/debug.css";

function decodeInviteRoom(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // atob returns a binary string (one byte per char). Room names may contain
    // multi-byte UTF-8 (e.g. 日本語), so decode bytes → UTF-8 rather than using
    // the binary string directly.
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload.room === "string" ? payload.room : null;
  } catch {
    return null;
  }
}

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

type AppView = "loading" | "auth" | "lobby" | "room" | "guest" | "recordings";

const THEME_NAMES: readonly ThemeName[] = ["default", "classic-light", "terminal", "material"];

function loadTheme(): ThemeName {
  const stored = localStorage.getItem("boom-theme");
  if (stored && (THEME_NAMES as readonly string[]).includes(stored)) return stored as ThemeName;
  return "default";
}

function loadAccent(theme: ThemeName): string | null {
  const v = localStorage.getItem(`boom-accent-${theme}`);
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyAccent(accent: string | null) {
  const root = document.documentElement;
  const props = ["--accent", "--accent-hover", "--accent-rgb", "--border-accent", "--text-accent", "--text-accent-hover"];
  if (!accent) {
    for (const p of props) root.style.removeProperty(p);
    return;
  }
  const hover = `color-mix(in srgb, ${accent}, white 18%)`;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-rgb", hexToRgbTriplet(accent));
  root.style.setProperty("--border-accent", accent);
  root.style.setProperty("--text-accent", accent);
  root.style.setProperty("--text-accent-hover", hover);
}

function App() {
  const [view, setView] = useState<AppView>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  const [error, setError] = useState("");
  const [guestError, setGuestError] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [, setPath] = useState(window.location.pathname);
  const [theme, setTheme] = useState<ThemeName>(loadTheme);
  const [accent, setAccent] = useState<string | null>(() => loadAccent(loadTheme()));

  // Apply theme to <html> so [data-theme] token overrides kick in globally
  useEffect(() => {
    if (theme === "default") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    localStorage.setItem("boom-theme", theme);
  }, [theme]);

  // Apply custom accent override + persist per-theme
  useEffect(() => {
    applyAccent(accent);
    if (accent) localStorage.setItem(`boom-accent-${theme}`, accent);
    else localStorage.removeItem(`boom-accent-${theme}`);
  }, [accent, theme]);

  // Switching themes loads that theme's saved accent (or clears if none)
  const handleThemeChange = useCallback((next: ThemeName) => {
    setTheme(next);
    setAccent(loadAccent(next));
  }, []);

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

  // On mount: check for invite token first, then fall back to normal OAuth flow
  useEffect(() => {
    (async () => {
      // Invite tokens travel in the URL fragment (not the query string) so
      // they don't leak to third parties via the Referer header.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const tok = hashParams.get("invite") ?? queryParams.get("invite");

      if (tok) {
        setInviteToken(tok);
        // Try restoring a guest session for this invite
        const session = loadSession();
        if (session?.inviteToken === tok && session.guestName) {
          try {
            const res = await fetch("/api/invite/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inviteToken: tok, name: session.guestName }),
            });
            if (res.ok) {
              const { token, serverUrl, identity, room } = await res.json();
              const restored: ConnectionDetails = { serverUrl, token, room, identity, inviteToken: tok, guestName: session.guestName };
              saveSession(restored);
              setConnectionDetails(restored);
              setView("room");
              return;
            }
          } catch {
            // Fall through to guest join form
          }
          clearSession();
        }
        setView("guest");
        return;
      }

      // Normal OAuth flow
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
        if (session && !session.inviteToken) {
          try {
            const tokenRes = await fetch("/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room: session.room }),
            });
            if (tokenRes.ok) {
              const { token, serverUrl, identity } = await tokenRes.json();
              const restored: ConnectionDetails = { ...session, token, serverUrl, identity };
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
      rememberRoom(identity, room);
      setError("");
      setConnectionDetails(details);
      setView("room");
    } catch (err) {
      setError(
        `Could not reach the server. (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }, [user]);

  const handleGuestJoin = useCallback(async (name: string, tok: string) => {
    setGuestError("");
    try {
      const res = await fetch("/api/invite/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: tok, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setGuestError(data?.error ?? `Failed to join (${res.status})`);
        return;
      }
      const { token, serverUrl, identity, room } = await res.json();
      const details: ConnectionDetails = { serverUrl, token, room, identity, inviteToken: tok, guestName: name };
      saveSession(details);
      setConnectionDetails(details);
      setView("room");
    } catch (err) {
      setGuestError(`Could not reach the server. (${err instanceof Error ? err.message : String(err)})`);
    }
  }, []);

  const handleLeave = useCallback((message?: string) => {
    clearSession();
    setConnectionDetails(null);
    // Guests go back to the join form; OAuth users go to lobby
    if (connectionDetails?.inviteToken) {
      setGuestError(message ?? "");
      setView("guest");
    } else {
      setError(message ?? "");
      setView("lobby");
    }
  }, [connectionDetails?.inviteToken]);

  const handleInvite = useCallback(async (): Promise<string> => {
    if (!connectionDetails) throw new Error("Not connected");
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: connectionDetails.room }),
    });
    if (!res.ok) throw new Error("Failed to generate invite link");
    const { inviteToken: tok } = await res.json();
    return `${window.location.origin}/#invite=${tok}`;
  }, [connectionDetails?.room]);

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

  if (view === "guest" && inviteToken) {
    const room = decodeInviteRoom(inviteToken) ?? "";
    return (
      <GuestJoinPage
        room={room}
        inviteToken={inviteToken}
        onJoin={handleGuestJoin}
        error={guestError}
      />
    );
  }

  if (view === "room" && connectionDetails) {
    return (
      <RoomPage
        connectionDetails={connectionDetails}
        onLeave={handleLeave}
        theme={theme}
        onThemeChange={handleThemeChange}
        accent={accent}
        onAccentChange={setAccent}
        onInvite={connectionDetails.inviteToken ? undefined : handleInvite}
      />
    );
  }

  if (view === "recordings") {
    return <RecordingsPage onBack={() => setView("lobby")} />;
  }

  // Lobby (default for authenticated users)
  return (
    <>
      <LobbyPage
        user={user!}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        onError={setError}
        onShowRecordings={() => setView("recordings")}
      />
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError("")} variant="toast" />
      )}
    </>
  );
}

export default App;
