import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8790;
// Fresh data file per test session so runs from earlier sessions don't leak in.
const DATA_FILE = join(tmpdir(), `rag-eval-e2e-${Date.now()}.json`);

export default defineConfig({
  testDir: "e2e",
  workers: 1, // tests share one server and its saved runs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && node --import tsx src/server/main.ts",
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), DATA_FILE },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
