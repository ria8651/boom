import { defineConfig } from "@playwright/test";

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
