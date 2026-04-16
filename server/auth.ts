import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

// --- GitHub OAuth helpers ---

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface SessionUser {
  username: string;
  name: string;
  avatar: string;
}

export function getGitHubAuthUrl(): string {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("GITHUB_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "read:org",
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = (await res.json()) as Record<string, string>;
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json() as Promise<GitHubUser>;
}

async function checkOrgMembership(accessToken: string, orgs: string[]): Promise<boolean> {
  for (const org of orgs) {
    try {
      const res = await fetch(`${GITHUB_API}/user/memberships/orgs/${org}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) return true;
    } catch {
      // Network error for this org, try next
    }
  }
  return false;
}

export async function isUserAllowed(username: string, accessToken: string): Promise<boolean> {
  const allowedUsers = (process.env.BOOM_ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowedOrgs = (process.env.BOOM_ALLOWED_ORGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Fail closed: if no allowlist configured, deny everyone
  if (allowedUsers.length === 0 && allowedOrgs.length === 0) return false;

  if (allowedUsers.includes(username.toLowerCase())) return true;
  if (allowedOrgs.length > 0) return checkOrgMembership(accessToken, allowedOrgs);
  return false;
}

// --- Session JWT (simple HMAC-signed JSON, no external dep) ---

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
const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function createSessionToken(user: SessionUser): string {
  const payload = base64urlEncode({
    sub: user.username,
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
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) {
      return null;
    }
    return {
      username: payload.sub,
      name: payload.name ?? payload.sub,
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

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
