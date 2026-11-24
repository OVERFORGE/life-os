/**
 * scripts/dev.mjs
 * 
 * LifeOS Unified Development Orchestrator
 * Starts the Next.js web application (backend kernel APIs + frontend UI)
 * and automatically launches the Electron desktop runtime once the server is ready.
 */

import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

// Load root .env variables so child processes inherit GROQ_API_KEY and other config
const envPath = path.resolve(rootDir, ".env");
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {}
}

console.log("\n=======================================================");
console.log("             LifeOS Unified Dev Launcher              ");
console.log("=======================================================\n");

let webProcess = null;
let desktopProcess = null;
let isShuttingDown = false;

function cleanExit(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n[LifeOS] Shutting down development runtime...");

  if (desktopProcess) {
    try {
      desktopProcess.kill();
    } catch {}
  }
  if (webProcess) {
    try {
      webProcess.kill();
    } catch {}
  }

  // Allow child cleanup then exit
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => cleanExit(0));
process.on("SIGTERM", () => cleanExit(0));

const PORT = process.env.PORT || "3456";

// Step 1: Start Next.js Web Server
console.log(`[1/2] Starting Next.js Web Server on port ${PORT} (Backend APIs & Frontend UI)...`);
webProcess = spawn(pnpmCmd, ["--filter", "web", "dev"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: isWindows,
  env: {
    ...process.env,
    PORT: PORT,
  },
});

webProcess.on("exit", (code) => {
  if (!isShuttingDown) {
    console.warn(`[LifeOS] Web server exited with code ${code}`);
    cleanExit(code || 0);
  }
});

// Step 2: Poll for web server readiness
function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        console.warn("[LifeOS] Timed out waiting for web server. Launching desktop anyway...");
        resolve(false);
        return;
      }

      const req = http.get(url, (res) => {
        clearInterval(interval);
        resolve(true);
      });

      req.on("error", () => {
        // Dev server not ready yet
      });

      req.end();
    }, 600);
  });
}

// Step 3: Launch Electron Desktop Runtime
async function launchDesktop() {
  const loginUrl = `http://localhost:${PORT}/login`;
  console.log(`[LifeOS] Waiting for server at ${loginUrl}...`);
  await waitForServer(loginUrl);

  if (isShuttingDown) return;

  console.log("\n[2/2] Web server ready! Compiling and launching Electron Desktop Runtime...\n");

  const tscBuild = spawn(
    pnpmCmd,
    ["--filter", "desktop", "exec", "tsc", "-p", "tsconfig.main.json"],
    {
      cwd: rootDir,
      stdio: "inherit",
      shell: isWindows,
    }
  );

  tscBuild.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[LifeOS] Electron TypeScript build failed with code ${code}`);
      return;
    }

    if (isShuttingDown) return;

    desktopProcess = spawn(
      pnpmCmd,
      ["--filter", "desktop", "exec", "electron", "."],
      {
        cwd: path.resolve(rootDir, "apps/desktop"),
        stdio: "inherit",
        shell: isWindows,
        env: {
          ...process.env,
          LIFEOS_WEB_URL: `http://localhost:${PORT}`,
        },
      }
    );

    desktopProcess.on("exit", (code) => {
      console.log(`[LifeOS] Electron desktop window closed (code ${code}).`);
      cleanExit(code || 0);
    });
  });
}

launchDesktop();
