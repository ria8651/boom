import { useState } from "react";
import type { ConnectionDetails } from "./types/connection";
import PreJoinPage from "./components/PreJoinPage";
import RoomPage from "./components/RoomPage";

function App() {
  const [connectionDetails, setConnectionDetails] =
    useState<ConnectionDetails | null>(null);

  return (
    <div data-lk-theme="boom" style={{ height: "100%" }}>
      {connectionDetails ? (
        <RoomPage
          connectionDetails={connectionDetails}
          onLeave={() => setConnectionDetails(null)}
        />
      ) : (
        <PreJoinPage onJoin={setConnectionDetails} />
      )}
    </div>
  );
}

export default App;
