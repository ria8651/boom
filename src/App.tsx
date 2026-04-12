import { useCallback, useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import PreJoinPage from "./components/PreJoinPage";
import RoomPage from "./components/RoomPage";

function App() {
  const [connectionDetails, setConnectionDetails] =
    useState<ConnectionDetails | null>(null);
  const [error, setError] = useState("");

  const handleLeave = useCallback((message?: string) => {
    setConnectionDetails(null);
    setError(message ?? "");
  }, []);

  const handleJoin = useCallback((details: ConnectionDetails) => {
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
