import { defineConfig } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const shouldStartServers = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
  ],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "off",
    trace: "on",
  },
  webServer: shouldStartServers
    ? [
        {
          command: "npm run dev -- --port 3000",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001",
          url: "http://localhost:8001/health",
          reuseExistingServer: true,
          timeout: 120_000,
          cwd: "../api",
          env: {
            SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
            SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            SUPABASE_JWT_AUD: process.env.SUPABASE_JWT_AUD ?? "authenticated",
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
          },
        },
      ]
    : undefined,
});
