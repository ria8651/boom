import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { AccessToken } from "livekit-server-sdk";
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
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_OPTIONS,
  SESSION_COOKIE_OPTIONS,
  validateInviteToken,
} from "./auth.js";
import { getLiveKitWsUrl, isRoomParticipant, listActiveRooms } from "./rooms.js";
import {
  RecordingError,
  deleteRecordingHandler,
  describeUpstreamError,
  downloadRecordingHandler,
  listRecordingsHandler,
  recoverActiveEgresses,
  startRoomRecording,
  stopRoomRecording,
  webhookHandler,
} from "./recordings.js";

const isDev = process.env.NODE_ENV === "development";
const app = express();

// Pin connect-src to the configured LiveKit origin so an XSS (if one ever
// landed) can't exfiltrate data to an arbitrary wss:/https: host.
function liveKitConnectOrigin(): string {
  try {
    return new URL(getLiveKitWsUrl()).origin;
  } catch {
    return "";
  }
}

// Security headers — relaxed in dev for Vite's inline scripts and HMR websocket
app.use(helmet({
  contentSecurityPolicy: isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", liveKitConnectOrigin()].filter(Boolean),
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

// LiveKit webhook posts signed JSON whose signature is a sha256 of the raw
// body, so the handler must see the body unparsed. Register it before the JSON
// middleware below.
app.post(
  "/api/livekit/webhook",
  express.raw({ type: "*/*", limit: "64kb" }),
  webhookHandler,
);

app.use(express.json({ limit: "1kb" }));
app.use(cookieParser());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Input validation
function isValidString(s: unknown, maxLen = 64): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= maxLen;
}

// Room names flow into filesystem paths (egress output template), HMAC payloads,
// and LiveKit grants. Reject path separators, nulls, and leading dots at the
// boundary so downstream code can trust the string.
function isValidRoomName(s: unknown): s is string {
  return isValidString(s) && !/[/\\\x00]/.test(s) && !s.startsWith(".");
}

// --- Auth routes ---

app.get("/api/auth/github", authLimiter, (_req, res) => {
  try {
    const state = crypto.randomBytes(16).toString("base64url");
    res.cookie(OAUTH_STATE_COOKIE, state, OAUTH_STATE_COOKIE_OPTIONS);
    res.redirect(getGitHubAuthUrl(state));
  } catch (err) {
    res.status(500).json({ error: "GitHub OAuth not configured" });
  }
});

app.get("/api/auth/github/callback", authLimiter, async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
  // Always clear the state cookie — it's single-use regardless of outcome.
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

  if (typeof code !== "string" || !code) {
    res.redirect("/?error=missing_code");
    return;
  }
  if (
    typeof state !== "string" ||
    !state ||
    typeof cookieState !== "string" ||
    state !== cookieState
  ) {
    res.redirect("/?error=invalid_state");
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
    // 502: boom is fine, the upstream (LiveKit) isn't. Lets the client
    // distinguish "the server is broken" from "we can't reach LiveKit".
    res.status(502).json({ error: `LiveKit unavailable (${describeUpstreamError(err)})` });
  }
});

// --- Recording ---

// Rebuild in-memory map on startup (survives server restarts while egress keeps running)
await recoverActiveEgresses();

app.post("/api/recordings/start", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;
  if (!isValidRoomName(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }

  try {
    const egressId = await startRoomRecording(room);
    res.json({ egressId });
  } catch (err) {
    if (err instanceof RecordingError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("Failed to start recording:", err);
    res.status(500).json({ error: "Failed to start recording" });
  }
});

app.post("/api/recordings/stop", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;
  if (!isValidRoomName(room)) {
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

app.get("/api/recordings", authMiddleware, listRecordingsHandler);
app.get("/api/recordings/:filename", authMiddleware, downloadRecordingHandler);
app.delete("/api/recordings/:filename", authMiddleware, deleteRecordingHandler);


// --- LiveKit token ---

app.post("/api/token", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;

  if (!isValidRoomName(room)) {
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
    serverUrl: getLiveKitWsUrl(),
    identity,
  });
});

// --- Invites ---

app.post("/api/invite", tokenLimiter, authMiddleware, async (req, res) => {
  const { room } = req.body;
  if (!isValidRoomName(room)) {
    res.status(400).json({ error: "room is required" });
    return;
  }
  // Only a current participant can mint invites — otherwise any allowlisted
  // user could hand out tokens to arbitrary rooms (including ones they've
  // never been in) and bypass the allowlist for third parties.
  if (!(await isRoomParticipant(room, req.user!.username))) {
    res.status(403).json({ error: "You must be in the room to create an invite" });
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
  const identitySuffix = crypto.randomBytes(8).toString("base64url");
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
  res.json({ token: jwt, serverUrl: getLiveKitWsUrl(), identity, room: invite.room });
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
