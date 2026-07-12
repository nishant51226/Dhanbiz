import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import path from "path";

// Load .env.test for local dev; CI sets env vars directly
config({ path: path.resolve(__dirname, ".env.test") });

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
const UAT_BASE_URL = process.env.UAT_BASE_URL ?? "";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-results/results.json" }],
    ["list"],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "on",
    video: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  outputDir: "playwright-results/",
  projects: [
    // ── API only (no browser / frontend required) ─────────
    {
      name: "api-local",
      testMatch: "**/api/**/*.spec.ts",
    },
    // ── Local: setup ──────────────────────────────────────
    {
      name: "local-setup",
      testMatch: "**/global.setup.ts",
      use: { baseURL: BASE_URL },
    },
    // ── Local: all tests ──────────────────────────────────
    {
      name: "local",
      testIgnore: "**/api/**",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: BASE_URL,
        storageState: ".playwright/auth/admin.json",
      },
      dependencies: ["local-setup"],
    },
    // ── UAT: setup (only when UAT_BASE_URL is set) ────────
    ...(UAT_BASE_URL
      ? [
          {
            name: "uat-setup",
            testMatch: "**/global.setup.ts",
            use: {
              baseURL: UAT_BASE_URL,
              extraHTTPHeaders: { "x-env": "uat" },
            },
          },
          {
            name: "uat",
            use: {
              ...devices["Desktop Chrome"],
              baseURL: UAT_BASE_URL,
              storageState: ".playwright/auth/uat-admin.json",
              extraHTTPHeaders: { "x-env": "uat" },
            },
            dependencies: ["uat-setup"],
          },
        ]
      : []),
  ],
});
