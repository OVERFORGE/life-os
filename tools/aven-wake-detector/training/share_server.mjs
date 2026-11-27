import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.WAKE_RECORD_PORT || 4580);
const BIN_DIR = path.join(__dirname, ".bin");
const CLOUDFLARED_EXE = path.join(BIN_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const DATASET_DIR = path.join(__dirname, "dataset_real");
const TOKEN_FILE = path.join(DATASET_DIR, ".invite_token");
const PUBLIC_URL_FILE = path.join(DATASET_DIR, ".public_url.json");

const CLOUDFLARED_DOWNLOAD_URL =
  process.platform === "win32"
    ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";

fs.mkdirSync(BIN_DIR, { recursive: true });
fs.mkdirSync(DATASET_DIR, { recursive: true });

function getOrCreateInviteToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t.length >= 8) return t;
  }
  const fresh = crypto.randomBytes(8).toString("hex");
  fs.writeFileSync(TOKEN_FILE, fresh, "utf8");
  return fresh;
}

async function ensureCloudflared() {
  if (fs.existsSync(CLOUDFLARED_EXE) && fs.statSync(CLOUDFLARED_EXE).size > 5 * 1024 * 1024) {
    return CLOUDFLARED_EXE;
  }
  console.log("[Aven Share] Downloading official standalone cloudflared binary (100% free, no account needed)...");
  const res = await fetch(CLOUDFLARED_DOWNLOAD_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download cloudflared (${res.status} ${res.statusText})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = CLOUDFLARED_EXE + ".tmp";
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, CLOUDFLARED_EXE);
  if (process.platform !== "win32") {
    fs.chmodSync(CLOUDFLARED_EXE, 0o755);
  }
  console.log(`[Aven Share] Cached cloudflared at ${CLOUDFLARED_EXE}`);
  return CLOUDFLARED_EXE;
}

async function main() {
  const inviteToken = getOrCreateInviteToken();
  if (fs.existsSync(PUBLIC_URL_FILE)) {
    try { fs.unlinkSync(PUBLIC_URL_FILE); } catch {}
  }

  const cfBin = await ensureCloudflared();

  // 1. Start local 16kHz WAV server
  const recorderProc = spawn(process.execPath, [path.join(__dirname, "record_server.mjs")], {
    env: {
      ...process.env,
      WAKE_RECORD_PORT: String(PORT),
      WAKE_RECORD_HOST: "127.0.0.1",
      WAKE_INVITE_TOKEN: inviteToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  recorderProc.stdout.on("data", (d) => process.stdout.write(d));
  recorderProc.stderr.on("data", (d) => process.stderr.write(d));

  // Wait briefly for local HTTP server bind
  await new Promise((r) => setTimeout(r, 800));

  // 2. Start free Cloudflare Quick Tunnel over HTTPS with automatic reconnect
  let tunnelProc = null;
  let isShuttingDown = false;

  function startTunnel() {
    if (isShuttingDown) return;
    let printedBanner = false;
    tunnelProc = spawn(
      cfBin,
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );

    const handleOutput = (chunk) => {
      const text = chunk.toString("utf8");
      const match = text.match(/https:\/\/(?!api\b)[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !printedBanner) {
        printedBanner = true;
        const publicUrl = match[0];
        const trainLink = `${publicUrl}/?mode=friend&split=train_real&k=${inviteToken}`;
        const blindLink = `${publicUrl}/?mode=friend&split=val_blind&k=${inviteToken}`;

        fs.writeFileSync(
          PUBLIC_URL_FILE,
          JSON.stringify({ publicUrl, inviteToken, trainLink, blindLink, updatedAt: new Date().toISOString() }, null, 2)
        );

        console.log("\n======================================================================");
        console.log("  AVEN WAKE-WORD STUDIO IS LIVE ONLINE (FREE CLOUDFLARE HTTPS TUNNEL)  ");
        console.log("======================================================================");
        console.log(`  Your Host Studio (Local):    http://127.0.0.1:${PORT}`);
        console.log("");
        console.log("  SEND TO FRIENDS FOR MULTI-SPEAKER TRAINING SAMPLES (train_real):");
        console.log(`    ${trainLink}`);
        console.log("");
        console.log("  SEND TO 2-3 FRIENDS FOR UNSEEN BLIND EVALUATION (val_blind):");
        console.log(`    ${blindLink}`);
        console.log("======================================================================\n");
      }
    };

    tunnelProc.stdout.on("data", handleOutput);
    tunnelProc.stderr.on("data", handleOutput);

    tunnelProc.on("exit", (code) => {
      if (isShuttingDown) return;
      console.warn(`[Aven Share] Cloudflare tunnel session disconnected (code ${code}). Auto-reconnecting in 3s...`);
      setTimeout(startTunnel, 3000);
    });
  }

  recorderProc.on("exit", (code) => {
    if (!isShuttingDown) {
      console.error(`[Aven Share] Recording server exited with code ${code}`);
      shutdown();
    }
  });

  startTunnel();

  const shutdown = () => {
    isShuttingDown = true;
    console.log("\n[Aven Share] Shutting down tunnel and recording server...");
    try { if (tunnelProc) tunnelProc.kill(); } catch {}
    try { recorderProc.kill(); } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Aven Share] Error:", err);
  process.exit(1);
});
