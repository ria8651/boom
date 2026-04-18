import { defineConfig } from "@playwright/test";

// Dedicated test port so this doesn't collide with `npm run dev` on 3000.
const TEST_PORT = 3456;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    screenshot: "on",
    trace: "retain-on-failure",
  },
  // Spin up a self-contained server. Passes NODE_ENV=development so /api/auth/dev
  // is exposed. LiveKit values are stubs — tests either mock the relevant
  // endpoints (app.spec.ts) or require the full docker stack (live.spec.ts,
  // which will fail clearly if not running).
  webServer: {
    command: "npm run dev",
    port: TEST_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      NODE_ENV: "development",
      PORT: String(TEST_PORT),
      BOOM_SESSION_SECRET: "playwright-test-secret",
      BOOM_ALLOWED_USERS: "dev,alice,bob,user1,user2,test",
      GITHUB_CLIENT_ID: "test",
      GITHUB_CLIENT_SECRET: "test",
      LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? "devkey-test",
      LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? "devsecret-test",
      LIVEKIT_URL: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
