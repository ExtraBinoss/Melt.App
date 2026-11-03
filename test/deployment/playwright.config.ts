import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: "hosting.spec.ts",
  workers: 1,
  timeout: 45000,
  outputDir: "../../artifacts/cloudflare/browser",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4183", reducedMotion: "reduce" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: {
    command: "bunx --no-install wrangler dev --env production --local --ip 127.0.0.1 --port 4183",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:4183",
    reuseExistingServer: !process.env.CI,
    timeout: 45000,
    env: { CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", WRANGLER_SEND_METRICS: "false" },
  },
});
