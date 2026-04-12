import express from "express";
import { AccessToken } from "livekit-server-sdk";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Token endpoint
app.post("/api/token", async (req, res) => {
  const { room, identity, password } = req.body;

  if (!room || !identity || !password) {
    res.status(400).json({ error: "room, identity, and password are required" });
    return;
  }

  if (password !== process.env.BOOM_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity, name: identity },
  );

  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  res.json({
    token: jwt,
    serverUrl: process.env.LIVEKIT_URL,
  });
});

// In production, serve the built frontend
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`boom server listening on port ${port}`);
});
