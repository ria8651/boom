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
  createSessionToken,
  exchangeCode,
  fetchGitHubUser,
  getGitHubAuthUrl,
  isUserAllowed,
  SESSION_COOKIE_OPTIONS,
} from "./auth.js";
import { listActiveRooms } from "./rooms.js";

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
