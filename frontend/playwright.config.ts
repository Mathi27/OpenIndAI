import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_PORT = 8011;
const WEB_PORT = 5183;
// Isolated, throwaway database so E2E runs never touch your local training data.
const DB = join(tmpdir(), `openindustri-e2e-${process.pid}.db`);
// The virtualenv layout differs between macOS/Linux (bin/) and Windows (Scripts\).
const UVICORN = process.platform === "win32" ? "..\\backend\\.venv\\Scripts\\uvicorn.exe" : "../backend/.venv/bin/uvicorn";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${UVICORN} app.main:app --app-dir ../backend --host 127.0.0.1 --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { OI_DB_PATH: DB, OI_PBKDF2_ITERATIONS: "2000" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { OI_API_TARGET: `http://127.0.0.1:${API_PORT}`, OI_WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
