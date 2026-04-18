import type { RequestHandler } from "express";
import fs from "fs/promises";
import path from "path";
import { EgressClient, WebhookReceiver } from "livekit-server-sdk";
import { DataPacket_Kind, EgressStatus, EncodedFileOutput } from "@livekit/protocol";
import { getLiveKitHttpUrl, getRoomServiceClient } from "./rooms.js";

const RECORDINGS_DIR = path.resolve(process.env.BOOM_RECORDINGS_DIR ?? "./recordings");
const FREE_SPACE_THRESHOLD_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB

// Strict filename validation for URL parameters. LiveKit's {room_name}-{time}.mp4
// template can produce names like "my-room-2026-04-18T12-30-45.mp4" or similar;
// keep the allow-list narrow so path traversal can't sneak in.
const FILENAME_REGEX = /^[a-zA-Z0-9_. -]{1,128}\.mp4$/;

// LiveKit egress's {time} substitution produces YYYY-MM-DDTHHMMSS in UTC.
// Anchoring on this exact shape lets us correctly extract both the room name
// (which may itself contain dashes) and the actual recording start time.
const TIMESTAMP_SUFFIX = /-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})\.mp4$/;

interface ParsedFilename {
  room: string;
  startedAt: number | null;
}

function parseFilename(filename: string): ParsedFilename {
  const m = filename.match(TIMESTAMP_SUFFIX);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    return {
      room: filename.slice(0, m.index!),
      startedAt: Number.isFinite(ms) ? ms : null,
    };
  }
  // Fallback for any file whose name doesn't match the egress template.
  const base = filename.replace(/\.mp4$/, "");
  const lastDash = base.lastIndexOf("-");
  return {
    room: lastDash > 0 ? base.slice(0, lastDash) : base,
    startedAt: null,
  };
}

// Egress's ffmpeg/gstreamer pipeline has failed for us on non-ASCII filepaths
// (room "アニメ" → the subprocess dies shortly after request validation). Pre-
// substitute the {room_name} part of the template with an ASCII-only version;
// leave {time} for LiveKit to resolve.
function safeFilenameComponent(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim().slice(0, 64);
  return cleaned || "recording";
}

function isSafeInsideDir(filename: string): boolean {
  if (!FILENAME_REGEX.test(filename)) return false;
  const resolved = path.resolve(RECORDINGS_DIR, filename);
  return resolved.startsWith(RECORDINGS_DIR + path.sep);
}

// room name -> active egress id (shared across the start/stop route and the
// webhook handler — the webhook is how we learn about crashes/disk-full failures)
export const activeEgresses = new Map<string, string>();

function getEgressClient(): EgressClient {
  return new EgressClient(
    getLiveKitHttpUrl(),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
}

async function setRoomRecordingMetadata(room: string, recording: boolean): Promise<void> {
  try {
    await getRoomServiceClient().updateRoomMetadata(room, JSON.stringify({ recording }));
  } catch (err) {
    console.warn(`Could not update metadata for room ${room}:`, err);
  }
}

async function sendRoomMessage(room: string, payload: object): Promise<void> {
  try {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await getRoomServiceClient().sendData(room, data, DataPacket_Kind.RELIABLE, {});
  } catch (err) {
    // Room may already be empty or gone — not fatal
    console.warn(`Could not send data to room ${room}:`, err);
  }
}

function isLiveEgressStatus(s: EgressStatus | undefined): boolean {
  return (
    s === EgressStatus.EGRESS_STARTING ||
    s === EgressStatus.EGRESS_ACTIVE ||
    s === EgressStatus.EGRESS_ENDING
  );
}

export async function recoverActiveEgresses(): Promise<void> {
  try {
    const active = await getEgressClient().listEgress({ active: true });
    for (const e of active) {
      if (e.roomName && isLiveEgressStatus(e.status)) {
        activeEgresses.set(e.roomName, e.egressId);
      }
    }
    if (activeEgresses.size > 0) {
      console.log(`Recovered ${activeEgresses.size} active recording(s)`);
    }
  } catch {
    // Egress service may not be running — that's fine
  }
}

// Verify a tracked egress is still alive on LiveKit's side. A crashed egress
// whose webhook never reached us (e.g. webhook URL misrouted) can linger in
// our map and block new starts; this lets the next start self-heal.
async function verifyEgressStillActive(egressId: string): Promise<boolean> {
  try {
    const list = await getEgressClient().listEgress({ egressId });
    const info = list[0];
    return info ? isLiveEgressStatus(info.status) : false;
  } catch {
    // If we can't reach egress we don't want to permanently block the user,
    // so treat as not-active. Worst case: a double start fails on LiveKit's
    // side and surfaces as a 500.
    return false;
  }
}

export class RecordingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RecordingError";
  }
}

async function getFreeBytes(dir: string): Promise<number | null> {
  try {
    const s = await fs.statfs(dir);
    return Number(s.bsize) * Number(s.bavail);
  } catch {
    return null;
  }
}

export async function startRoomRecording(room: string): Promise<string> {
  const existingId = activeEgresses.get(room);
  if (existingId) {
    if (await verifyEgressStillActive(existingId)) {
      throw new RecordingError(409, "Room is already being recorded");
    }
    activeEgresses.delete(room);
    await setRoomRecordingMetadata(room, false);
  }

  await fs.mkdir(RECORDINGS_DIR, { recursive: true }).catch(() => { /* may be read-only mount */ });

  const free = await getFreeBytes(RECORDINGS_DIR);
  if (free !== null && free < FREE_SPACE_THRESHOLD_BYTES) {
    const freeGb = (free / 1024 ** 3).toFixed(1);
    throw new RecordingError(
      507,
      `Not enough disk space to record (${freeGb} GB free). Free up space and try again.`,
    );
  }

  try {
    await fs.access(RECORDINGS_DIR, fs.constants.W_OK);
  } catch {
    throw new RecordingError(
      500,
      "Server cannot write to the recordings directory. Check filesystem permissions.",
    );
  }

  try {
    const safeName = safeFilenameComponent(room);
    const output = new EncodedFileOutput({ filepath: `/out/${safeName}-{time}.mp4` });
    const info = await getEgressClient().startRoomCompositeEgress(room, output);
    activeEgresses.set(room, info.egressId);
    await setRoomRecordingMetadata(room, true);
    return info.egressId;
  } catch (err) {
    console.error("Failed to start recording:", err);
    throw new RecordingError(500, `Failed to start recording: ${describeUpstreamError(err)}`);
  }
}

export async function stopRoomRecording(room: string): Promise<boolean> {
  const egressId = activeEgresses.get(room);
  if (!egressId) return false;
  try {
    await getEgressClient().stopEgress(egressId);
  } catch (err) {
    // Egress may have already stopped on its own
    console.warn(`Could not stop egress ${egressId}:`, err);
  }
  activeEgresses.delete(room);
  await setRoomRecordingMetadata(room, false);
  return true;
}

export interface RecordingEntry {
  filename: string;
  room: string;
  startedAt: number;
  size: number;
  inProgress: boolean;
}

export const listRecordingsHandler: RequestHandler = async (_req, res) => {
  let entries: string[];
  try {
    entries = await fs.readdir(RECORDINGS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.json([]);
      return;
    }
    console.error("Failed to read recordings dir:", err);
    res.status(500).json({ error: "Failed to list recordings" });
    return;
  }

  const activeRooms = new Set(activeEgresses.keys());
  const files = await Promise.all(
    entries
      .filter((name) => FILENAME_REGEX.test(name))
      .map(async (filename): Promise<RecordingEntry | null> => {
        try {
          const stat = await fs.stat(path.join(RECORDINGS_DIR, filename));
          if (!stat.isFile()) return null;
          const { room, startedAt } = parseFilename(filename);
          return {
            filename,
            room,
            // Filename timestamp is the recording START (per egress template);
            // mtime is fallback for files that don't match the template.
            startedAt: startedAt ?? stat.mtimeMs,
            size: stat.size,
            inProgress: activeRooms.has(room),
          };
        } catch {
          return null;
        }
      }),
  );

  const results = files.filter((f): f is RecordingEntry => f !== null);
  results.sort((a, b) => b.startedAt - a.startedAt);
  res.json(results);
};

export const downloadRecordingHandler: RequestHandler = (req, res) => {
  const filename = String(req.params.filename);
  if (!isSafeInsideDir(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  // Use root-relative sendFile so the underlying `send` library applies its
  // dotfile check only to the relative filename (not to the absolute
  // RECORDINGS_DIR, which can legitimately contain a `.claude` segment etc).
  res.sendFile(filename, { root: RECORDINGS_DIR, dotfiles: "deny" }, (err) => {
    if (err && !res.headersSent) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        res.status(404).json({ error: "Recording not found" });
      } else {
        console.error("Failed to send recording:", err);
        res.status(500).json({ error: "Failed to send recording" });
      }
    }
  });
};

export const deleteRecordingHandler: RequestHandler = async (req, res) => {
  const filename = String(req.params.filename);
  if (!isSafeInsideDir(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const { room } = parseFilename(filename);
  if (activeEgresses.has(room)) {
    res.status(409).json({ error: "Recording is still in progress" });
    return;
  }
  try {
    await fs.unlink(path.resolve(RECORDINGS_DIR, filename));
    res.json({ ok: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "Recording not found" });
      return;
    }
    console.error("Failed to delete recording:", err);
    res.status(500).json({ error: "Failed to delete recording" });
  }
};

// Webhook endpoint — LiveKit POSTs JSON with an `Authorization` JWT that
// signs a sha256 of the body. WebhookReceiver.receive() verifies both.
// Requires the route to receive the raw body, not parsed JSON.
export const webhookHandler: RequestHandler = async (req, res) => {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: "Webhook verifier not configured" });
    return;
  }

  const receiver = new WebhookReceiver(apiKey, apiSecret);
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  let event;
  try {
    event = await receiver.receive(raw, req.headers.authorization);
  } catch (err) {
    console.warn("Rejected LiveKit webhook:", err);
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  try {
    await handleWebhookEvent(event.event, event.egressInfo);
  } catch (err) {
    console.error("Error handling webhook event:", err);
  }
  res.sendStatus(200);
};

async function handleWebhookEvent(
  name: string,
  egressInfo: { roomName?: string; status?: EgressStatus; error?: string } | undefined,
): Promise<void> {
  if (name !== "egress_ended" || !egressInfo?.roomName) return;

  const room = egressInfo.roomName;
  activeEgresses.delete(room);
  await setRoomRecordingMetadata(room, false);

  const status = egressInfo.status;
  if (status === EgressStatus.EGRESS_COMPLETE) {
    await sendRoomMessage(room, { type: "recording-finished" });
    return;
  }

  if (
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    const message = friendlyEgressError(egressInfo.error) ?? "Recording stopped unexpectedly";
    await sendRoomMessage(room, { type: "recording-error", message });
  }
}

export function describeUpstreamError(err: unknown): string {
  const e = err as { cause?: { code?: string; hostname?: string }; message?: string };
  const code = e?.cause?.code;
  if (code === "ENOTFOUND") {
    return `cannot resolve ${e.cause?.hostname ?? "LiveKit host"} — check LIVEKIT_URL`;
  }
  if (code === "ECONNREFUSED") {
    return "LiveKit refused the connection — is the server running?";
  }
  if (code === "ETIMEDOUT") {
    return "LiveKit timed out";
  }
  return e?.message ?? "upstream error";
}

function friendlyEgressError(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("no space left") || lower.includes("enospc")) {
    return "Recording stopped: the server ran out of disk space.";
  }
  if (lower.includes("permission denied") || lower.includes("eacces")) {
    return "Recording stopped: the server couldn't write the file (permission denied).";
  }
  return `Recording stopped: ${raw}`;
}
