import crypto from "crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { AccessToken } from "livekit-server-sdk";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "wss:", "https:"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

// Rate limiting on token endpoint — 10 attempts per minute per IP
const tokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a minute." },
});

// Trust proxy (behind reverse proxy)
app.set("trust proxy", 1);

app.use(express.json({ limit: "1kb" }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Timing-safe password comparison
function checkPassword(input: string): boolean {
  const expected = process.env.BOOM_PASSWORD ?? "";
  if (input.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(input),
    Buffer.from(expected),
  );
}

// Input validation
function isValidString(s: unknown, maxLen = 64): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= maxLen;
}

// Token endpoint
app.post("/api/token", tokenLimiter, async (req, res) => {
  const { room, identity, password } = req.body;

  if (!isValidString(room) || !isValidString(identity) || !isValidString(password, 128)) {
    res.status(400).json({ error: "room, identity, and password are required" });
    return;
  }

  if (!checkPassword(password)) {
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
