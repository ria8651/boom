import React from "react";
import ReactDOM from "react-dom/client";

import "@livekit/components-styles";
import "./theme/fonts.css";
import "./theme/boom-theme.css";
import "./App.css";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
