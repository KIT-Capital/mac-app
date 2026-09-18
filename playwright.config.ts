import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

const port = 43173;
const baseURL = `http://127.0.0.1:${port}`;
process.env.DESK_DEVELOPMENT_PASSWORD ??= randomBytes(18).toString("base64url");
process.env.DESK_SESSION_SECRET ??= randomBytes(32).toString("base64url");

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    viewport: { width: 480, height: 1100 },
    hasTouch: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `doppler run -- node tools/harness/start-e2e.mjs dev --hostname 127.0.0.1 --port ${port}`,
    env: {
      DESK_DEVELOPMENT_PASSWORD: process.env.DESK_DEVELOPMENT_PASSWORD,
      DESK_SESSION_SECRET: process.env.DESK_SESSION_SECRET,
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
