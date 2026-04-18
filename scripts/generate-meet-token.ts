// Generates a LiveKit token and prints a ready-to-paste meet.livekit.io URL
// for testing rooms against your running LiveKit server without using the
// full boom UI. Usage:
//   npm run meet-token              # identity "tester", room "test"
//   npm run meet-token -- --room foo --identity alice

import { AccessToken } from "livekit-server-sdk";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const serverUrl = process.env.LIVEKIT_URL;

if (!apiKey || !apiSecret || !serverUrl) {
  console.error("Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or LIVEKIT_URL.");
  console.error("Run with --env-file=.env or set them in your shell.");
  process.exit(1);
}

const room = arg("room", "test");
const identity = arg("identity", "tester");

const token = new AccessToken(apiKey, apiSecret, { identity });
token.addGrant({
  roomJoin: true,
  room,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
});

const jwt = await token.toJwt();

const meetUrl = new URL("https://meet.livekit.io/custom");
meetUrl.searchParams.set("liveKitUrl", serverUrl);
meetUrl.searchParams.set("token", jwt);

console.log(`Room:     ${room}`);
console.log(`Identity: ${identity}`);
console.log(`URL:      ${serverUrl}`);
console.log();
console.log("Paste this into your browser:");
console.log(meetUrl.toString());
