import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { AccessToken, EgressClient } from "livekit-server-sdk";
import { EncodedFileOutput } from "@livekit/protocol";
import path from "path";
import { fileURLToPath } from "url";
import {
  authMiddleware,
  createInviteToken,
  createSessionToken,
  exchangeCode,
  fetchGitHubUser,
  getGitHubAuthUrl,
  isUserAllowed,
  SESSION_COOKIE_OPTIONS,
  validateInviteToken,
} from "./auth.js";
import { getLiveKitHttpUrl, getRoomServiceClient, listActiveRooms } from "./rooms.js";

const isDev = process.env.NODE_ENV === "development";
const app = express();

// Security headers — relaxed in dev for Vite's inline scripts and HMR websocket
app.use(helmet({
  contentSecurityPolicy: isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "wss:", "https:"],
      imgSrc: ["'self'", "data:", "blob:", "https://avatars.githubusercontent.com"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a minute." },
});

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
app.use(cookieParser());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Input validation
function isValidString(s: unknown, maxLen = 64): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= maxLen;
}

// --- Auth routes ---

app.get("/api/auth/github", authLimiter, (_req, res) => {
  try {
    res.redirect(getGitHubAuthUrl());
  } catch (err) {
    res.status(500).json({ error: "GitHub OAuth not configured" });
  }
});

app.get("/api/auth/github/callback", authLimiter, async (req, res) => {
  const code = req.query.code;
  if (typeof code !== "string" || !code) {
    res.redirect("/?error=missing_code");
    return;
  }

  try {
    const accessToken = await exchangeCode(code);
    const ghUser = await fetchGitHubUser(accessToken);

    if (!(await isUserAllowed(ghUser.login, accessToken))) {
      res.redirect("/?error=not_allowed");
      return;
    }

    const sessionToken = createSessionToken({
      username: ghUser.login,
      name: ghUser.name ?? ghUser.login,
      avatar: ghUser.avatar_url,
    });

    res.cookie("boom_session", sessionToken, SESSION_COOKIE_OPTIONS);
    res.redirect("/");
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    res.redirect("/?error=auth_failed");
  }
});

// Dev-only: skip OAuth and log in as a test user (?user=alice to pick a name)
if (isDev) {
  app.get("/api/auth/dev", (req, res) => {
    const username = typeof req.query.user === "string" && req.query.user
      ? req.query.user.slice(0, 32)
      : "dev";
    const sessionToken = createSessionToken({
      username,
      name: username,
      avatar: "",
    });
    res.cookie("boom_session", sessionToken, SESSION_COOKIE_OPTIONS);
    res.redirect("/");
  });
}

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("boom_session", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

// --- Rooms ---

app.get("/api/rooms", authMiddleware, async (_req, res) => {
  try {
    const rooms = await listActiveRooms();
    res.json(rooms);
  } catch (err) {
    console.error("Failed to list rooms:", err);
    res.status(500).json({ error: "Failed to list rooms" });
  }
});

// --- Recording ---

function getEgressClient(): EgressClient {
  return new EgressClient(
    getLiveKitHttpUrl(),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
}

// room name → egress ID
const activeEgresses = new Map<string, string>();

// Rebuild in-memory map on startup (survives server restarts while egress keeps running)
try {
  const egress = getEgressClient();
  const active = await egress.listEgress({ active: true });
  for (const e of active) {
    if (e.roomName) activeEgresses.set(e.roomName, e.egressId);
  }
  if (activeEgresses.size > 0) {
    console.log(`Recovered ${activeEgresses.size} active recording(s)`);
  }
} catch {
  // Egress service may not be running — that's fine
}

async function setRoomRecordingMetadata(room: string, recording: boolean) {
  const roomService = getRoomServiceClient();
  try {
    await roomService.updateRoomMetadata(room, JSON.stringify({ recording }));
  } catch (err) {
    // Room may have already been cleaned up — not fatal
    console.warn(`Could not update metadata for room ${room}:`, err);
  }
}

async function stopRoomRecording(room: string): Promise<boolean> {
  const egressId = activeEgresses.get(room);
  if (!egressId) return false;
  try {
    const egress = getEgressClient();
    await egress.stopEgress(egressId);
  } catch (err) {
    // Egress may have already stopped on its own
    console.warn(`Could not stop egress ${egressId}:`, err);
  }
  activeEgresses.delete(room);
  await setRoomRecordingMetadata(room, false);
  return true;
}

app.post("/api/recordings/start", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;
  if (!isValidString(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }

  if (activeEgresses.has(room)) {
    res.status(409).json({ error: "Room is already being recorded" });
    return;
  }

  try {
    const egress = getEgressClient();
    const output = new EncodedFileOutput({ filepath: "/out/{room_name}-{time}.mp4" });
    const info = await egress.startRoomCompositeEgress(room, output);
    activeEgresses.set(room, info.egressId);
    await setRoomRecordingMetadata(room, true);
    res.json({ egressId: info.egressId });
  } catch (err) {
    console.error("Failed to start recording:", err);
    res.status(500).json({ error: "Failed to start recording" });
  }
});

app.post("/api/recordings/stop", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;
  if (!isValidString(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }

  const stopped = await stopRoomRecording(room);
  if (!stopped) {
    res.status(404).json({ error: "No active recording for this room" });
    return;
  }
  res.json({ ok: true });
});


// --- LiveKit token ---

app.post("/api/token", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;

  if (!isValidString(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }

  const identity = req.user!.username;
  const displayName = req.user!.name;

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      name: displayName,
      metadata: JSON.stringify({ avatar: req.user!.avatar }),
    },
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
    identity,
  });
});

// --- Invites ---

app.post("/api/invite", tokenLimiter, authMiddleware, (req, res) => {
  const { room } = req.body;
  if (!isValidString(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }
  res.json({ inviteToken: createInviteToken(room) });
});

app.post("/api/invite/join", tokenLimiter, async (req, res) => {
  const { inviteToken, name } = req.body;
  if (!isValidString(inviteToken, 512) || !isValidString(name)) {
    res.status(400).json({ error: "inviteToken and name are required" });
    return;
  }

  const invite = validateInviteToken(inviteToken);
  if (!invite) {
    res.status(401).json({ error: "Invalid or expired invite link." });
    return;
  }

  const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().slice(0, 32) || "guest";
  const identitySuffix = Math.random().toString(16).slice(2, 6);
  const identity = `guest-${safeName.replace(/\s+/g, "_")}-${identitySuffix}`;

  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity, name: safeName },
  );
  token.addGrant({
    roomJoin: true,
    room: invite.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();
  res.json({ token: jwt, serverUrl: process.env.LIVEKIT_URL, identity, room: invite.room });
});

// --- Static / Vite ---

if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get("/{*splat}", async (_req, res, next) => {
    try {
      const raw = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
      const html = await vite.transformIndexHtml(_req.originalUrl, raw);
      res.status(200).set("Content-Type", "text/html").send(html);
    } catch (e) {
      next(e);
    }
  });
} else {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`boom server listening on port ${port} (${isDev ? "dev" : "production"})`);
});
