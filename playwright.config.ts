// Browser acceptance tests for the planner. Runs against `vite preview` of the production build,
// using the installed Microsoft Edge (no browser download).
import { defineConfig } from "@playwright/test";

const port = 4199;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: "msedge",
    acceptDownloads: true,
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
