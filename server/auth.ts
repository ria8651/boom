import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// --- Bastion SSO ---
//
// Boom relies on bastion (../bastion) for identity. The flow:
//   unauthed → GET /api/auth/login → redirect to <bastion>/auth/login?service=<slug>
//   bastion  → user authenticates → redirect to <self>/api/auth/bastion?bastion_token=<jwt>
//   we verify the JWT against bastion's JWKS, enrich via /api/introspect, mint our
//   own HMAC session cookie, redirect /
//
// LiveKit identity is keyed on `username` (bastion's display name claim). A user
// renaming themselves on bastion would cause their LiveKit identity to change on
// next login — acceptable for a small self-hosted setup.

export interface AuthConfig {
  bastionOrigin: string;
  serviceSlug: string;
}

export function loadAuthConfig(): AuthConfig | null {
  const bastionOrigin = process.env.BASTION_ORIGIN;
  if (!bastionOrigin) return null;
  return {
    bastionOrigin: bastionOrigin.replace(/\/$/, ""),
    serviceSlug: process.env.BASTION_SERVICE_SLUG || "boom",
  };
}

let cachedConfig: AuthConfig | null | undefined;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getConfig(): AuthConfig | null {
  if (cachedConfig === undefined) cachedConfig = loadAuthConfig();
  return cachedConfig;
}

function getJwks(cfg: AuthConfig): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(`${cfg.bastionOrigin}/.well-known/jwks.json`));
  }
  return cachedJwks;
}

export function getBastionLoginUrl(cfg: AuthConfig): string {
  const params = new URLSearchParams({ service: cfg.serviceSlug });
  return `${cfg.bastionOrigin}/auth/login?${params}`;
}

interface BastionClaims extends JWTPayload {
  username?: string;
  svc?: string;
}

export async function verifyBastionToken(
  cfg: AuthConfig,
  token: string,
): Promise<{ sub: string; username: string }> {
  const { payload } = await jwtVerify<BastionClaims>(token, getJwks(cfg), {
    issuer: cfg.bastionOrigin,
    audience: cfg.serviceSlug,
    algorithms: ["RS256"],
  });
  if (payload.svc !== cfg.serviceSlug) {
    throw new Error("token svc claim mismatch");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("missing sub claim");
  }
  const username = typeof payload.username === "string" && payload.username
    ? payload.username
    : `user:${payload.sub.slice(0, 8)}`;
  return { sub: payload.sub, username };
}

export interface IntrospectResult {
  username: string | null;
  email: string | null;
  avatar: string | null;
  granted: boolean;
}

export async function introspectBastionToken(
  cfg: AuthConfig,
  token: string,
): Promise<IntrospectResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${cfg.bastionOrigin}/api/introspect`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[auth] introspect returned ${res.status}`);
      return { username: null, email: null, avatar: null, granted: false };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      username: typeof data.username === "string" ? data.username : null,
      email: typeof data.email === "string" ? data.email : null,
      avatar: typeof data.avatar === "string" ? data.avatar : null,
      granted: data.granted === true,
    };
  } catch (err) {
    console.warn("[auth] introspect failed:", err);
    return { username: null, email: null, avatar: null, granted: false };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Session JWT (simple HMAC-signed JSON, no external dep) ---

export interface SessionUser {
  sub: string;
  username: string;
  name: string;
  avatar: string;
}

function getSecret(): Buffer {
  const secret = process.env.BOOM_SESSION_SECRET;
  if (!secret) throw new Error("BOOM_SESSION_SECRET is not set");
  return Buffer.from(secret);
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64urlEncode(obj: object): string {
  return base64url(Buffer.from(JSON.stringify(obj)));
}

function sign(headerPayload: string): string {
  return base64url(
    crypto.createHmac("sha256", getSecret()).update(headerPayload).digest(),
  );
}

const JWT_HEADER = base64urlEncode({ alg: "HS256", typ: "JWT" });
const SESSION_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

export function createSessionToken(user: SessionUser): string {
  const payload = base64urlEncode({
    type: "session",
    sub: user.sub,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS,
  });
  const headerPayload = `${JWT_HEADER}.${payload}`;
  return `${headerPayload}.${sign(headerPayload)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const headerPayload = `${parts[0]}.${parts[1]}`;
  const expected = sign(headerPayload);
  const sig = Buffer.from(parts[2]);
  const exp = Buffer.from(expected);
  if (sig.length !== exp.length || !crypto.timingSafeEqual(sig, exp)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.type !== "session") return null;
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) {
      return null;
    }
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.username !== "string" || !payload.username) return null;
    return {
      sub: payload.sub,
      username: payload.username,
      name: payload.name ?? payload.username,
      avatar: payload.avatar ?? "",
    };
  } catch {
    return null;
  }
}

// --- Express middleware ---

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const DEV_USER: SessionUser = {
  sub: "dev",
  username: "dev",
  name: "dev",
  avatar: "",
};

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Auth-off mode: BASTION_ORIGIN unset → inject a default dev identity so
  // downstream handlers can always rely on req.user. Never expose unconfigured.
  if (!getConfig()) {
    req.user = DEV_USER;
    next();
    return;
  }

  const token = req.cookies?.boom_session;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.user = user;
  next();
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "lax" as const,
  maxAge: SESSION_EXPIRY_SECONDS * 1000,
  path: "/",
};

// --- Invite tokens (HMAC-signed, 24 h expiry) ---

function getInviteExpirySeconds(): number {
  const val = parseInt(process.env.BOOM_INVITE_EXPIRY_HOURS ?? "4", 10);
  return (isNaN(val) || val <= 0 ? 4 : val) * 3600;
}

export function createInviteToken(room: string): string {
  const payload = base64urlEncode({
    type: "invite",
    room,
    exp: Math.floor(Date.now() / 1000) + getInviteExpirySeconds(),
  });
  const headerPayload = `${JWT_HEADER}.${payload}`;
  return `${headerPayload}.${sign(headerPayload)}`;
}

export function validateInviteToken(token: string): { room: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const headerPayload = `${parts[0]}.${parts[1]}`;
    const expected = sign(headerPayload);
    const sig = Buffer.from(parts[2]);
    const exp = Buffer.from(expected);
    if (sig.length !== exp.length || !crypto.timingSafeEqual(sig, exp)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.type !== "invite") return null;
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
    if (typeof payload.room !== "string" || !payload.room) return null;
    return { room: payload.room };
  } catch {
    return null;
  }
}
