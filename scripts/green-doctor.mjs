#!/usr/bin/env node
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const findRepoRoot = () => {
  const candidate = path.resolve(scriptDir, "..");
  if (
    fs.existsSync(path.join(candidate, "apps", "web", "package.json")) &&
    fs.existsSync(path.join(candidate, "apps", "api"))
  ) {
    return candidate;
  }

  let current = process.cwd();
  while (current && current !== path.parse(current).root) {
    if (
      fs.existsSync(path.join(current, "apps", "web", "package.json")) &&
      fs.existsSync(path.join(current, "apps", "api"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }

  throw new Error("Unable to locate repo root (apps/web + apps/api).");
};

const repoRoot = findRepoRoot();
const webDir = path.join(repoRoot, "apps", "web");
const apiDir = path.join(repoRoot, "apps", "api");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    if (!key || process.env[key]) return;
    const value = raw.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  });
};

loadEnvFile(path.join(webDir, ".env.local"));
loadEnvFile(path.join(apiDir, ".env.local"));

const webPort = Number(process.env.GREEN_WEB_PORT || 3001);
const apiPort = Number(process.env.GREEN_API_PORT || 8001);
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const proofDir = path.join(repoRoot, "docs", "green-proof", timestamp);
fs.mkdirSync(proofDir, { recursive: true });

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(
    `Missing required env vars: ${missingEnv.join(", ")} (needed for GREEN).`,
  );
  process.exit(1);
}
if (!process.env.GREEN_EXISTING_EMAIL || !process.env.GREEN_EXISTING_PASSWORD) {
  console.warn(
    "GREEN_EXISTING_EMAIL / GREEN_EXISTING_PASSWORD not set. If email confirmation is required, the test will fail.",
  );
}
if (!process.env.GREEN_INVITEE_EMAIL || !process.env.GREEN_INVITEE_PASSWORD) {
  console.warn(
    "GREEN_INVITEE_EMAIL / GREEN_INVITEE_PASSWORD not set. If invitee email confirmation is required, the test will fail.",
  );
}

const execOrEmpty = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};

const findPids = (port) => {
  const lines = execOrEmpty(`lsof -tiTCP:${port} -sTCP:LISTEN`);
  return lines
    .map((pid) => Number(pid.trim()))
    .filter((pid) => Number.isFinite(pid));
};

const killPort = async (port) => {
  const pids = findPids(port);
  if (!pids.length) return;
  console.log(`[green-doctor] Port ${port} in use: ${pids.join(", ")}. Stopping...`);
  pids.forEach((pid) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const remaining = findPids(port);
  remaining.forEach((pid) => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  });
};

const waitForHttp = async (url, timeoutMs = 60_000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

const spawnLogged = (command, args, options, logName) => {
  const logPath = path.join(proofDir, logName);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  return { child, logPath };
};

let apiProcess;
let webProcess;

const cleanup = () => {
  if (webProcess?.child?.pid) {
    try {
      webProcess.child.kill("SIGTERM");
    } catch {}
  }
  if (apiProcess?.child?.pid) {
    try {
      apiProcess.child.kill("SIGTERM");
    } catch {}
  }
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});

const run = async () => {
  await killPort(webPort);
  await killPort(apiPort);

  apiProcess = spawnLogged(
    "python3",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
    { cwd: apiDir, env: { ...process.env } },
    "api.log",
  );

  webProcess = spawnLogged(
    "npm",
    ["run", "dev", "--", "--port", String(webPort)],
    { cwd: webDir, env: { ...process.env } },
    "web.log",
  );

  const apiReady = await waitForHttp(`${apiUrl}/health`, 90_000);
  const webReady = await waitForHttp(`${webUrl}/auth/sign-in`, 90_000);

  if (!apiReady || !webReady) {
    cleanup();
    console.error(
      `Servers not ready (api=${apiReady}, web=${webReady}). Logs: ${proofDir}`,
    );
    process.exit(1);
  }

  console.log("[green-doctor] Servers ready. Running GREEN test...");
  const testEnv = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: webUrl,
    GREEN_PROOF_DIR: proofDir,
  };
  const testProc = spawn("npm", ["run", "test:green"], {
    cwd: webDir,
    env: testEnv,
    stdio: "inherit",
  });
  testProc.on("exit", (code) => {
    cleanup();
    if (code === 0) {
      console.log(`[green-doctor] PASS. Artifacts: ${proofDir}`);
      process.exit(0);
    }
    console.error(`[green-doctor] FAIL. Artifacts: ${proofDir}`);
    process.exit(code ?? 1);
  });
};

run().catch((error) => {
  cleanup();
  console.error("[green-doctor] ERROR:", error?.message || error);
  console.error(`Artifacts: ${proofDir}`);
  process.exit(1);
});
