import { useCallback, useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import PreJoinPage from "./components/PreJoinPage";
import RoomPage from "./components/RoomPage";

const SESSION_KEY = "boom:session";

function loadSession(): ConnectionDetails | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.serverUrl && parsed.token && parsed.password) return parsed;
  } catch { /* ignore corrupt data */ }
  return null;
}

function saveSession(details: ConnectionDetails) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(details));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function App() {
  const [connectionDetails, setConnectionDetails] =
    useState<ConnectionDetails | null>(loadSession);
  const [error, setError] = useState("");

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

  return (
    <div data-lk-theme="boom" style={{ height: "100%" }}>
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
