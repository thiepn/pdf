import { defineConfig, devices } from "@playwright/test";

declare const process: { env: Record<string, string | undefined> };

function normalizeBase(value?: string): string {
  const raw = value?.trim() || "/";
  const leading = raw.startsWith("/") ? raw : `/${raw}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

const basePath = normalizeBase(process.env.PLAYWRIGHT_BASE_PATH ?? process.env.VITE_BASE_PATH);
const serverOrigin = "http://127.0.0.1:4173";
const serverUrl = `${serverOrigin}${basePath}`;
const skipBuild = process.env.PLAYWRIGHT_SKIP_BUILD === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: serverUrl,
    trace: "on-first-retry"
  },
  webServer: {
    command: skipBuild ? "npm run preview -- --host 127.0.0.1" : "npm run build && npm run preview -- --host 127.0.0.1",
    url: serverUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  },
  projects: [
    { name: "chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
    {
      name: "mobile-chromium",
      testMatch: /mobile\.spec\.ts/,
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    },
    {
      name: "tablet-webkit",
      testMatch: /mobile\.spec\.ts/,
      use: { browserName: "webkit", viewport: { width: 834, height: 1112 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    }
  ]
});
