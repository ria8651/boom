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

  // Validate the token against the LiveKit server before handing it to the client.
  // This catches misconfigurations (wrong API key, unreachable server) early
  // with a clear error, instead of the client seeing a cryptic WebSocket failure.
  const livekitUrl = process.env.LIVEKIT_URL;
  if (livekitUrl) {
    const httpUrl = livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    try {
      const validateRes = await fetch(
        `${httpUrl}/rtc/v1/validate?access_token=${jwt}`,
      );
      if (!validateRes.ok) {
        const body = await validateRes.text();
        console.error(`LiveKit validation failed (${validateRes.status}): ${body}`);
        res.status(502).json({
          error: `LiveKit server rejected the connection: ${body || validateRes.statusText}. Check your API key/secret and server configuration.`,
        });
        return;
      }
    } catch (err) {
      console.error("Could not reach LiveKit server:", err);
      res.status(502).json({
        error: `Could not reach LiveKit server at ${livekitUrl}. Check that it is running and the URL is correct.`,
      });
      return;
    }
  }

  res.json({
    token: jwt,
    serverUrl: livekitUrl,
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
