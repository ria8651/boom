import { defineConfig } from "@playwright/test";

// Tests assume `npm run dev` (or the docker stack) is already running on :3000.
// Run `npm run dev` in another terminal before `npm test`.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
