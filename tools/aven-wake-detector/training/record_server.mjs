import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.WAKE_RECORD_PORT || 4580);
const HOST = process.env.WAKE_RECORD_HOST || "127.0.0.1";
const DATASET_DIR = path.join(__dirname, "dataset_real");
const HTML_PATH = path.join(__dirname, "recorder.html");
const TOKEN_FILE = path.join(DATASET_DIR, ".invite_token");
const PUBLIC_URL_FILE = path.join(DATASET_DIR, ".public_url.json");

fs.mkdirSync(DATASET_DIR, { recursive: true });

function getOrCreateInviteToken() {
  if (process.env.WAKE_INVITE_TOKEN && process.env.WAKE_INVITE_TOKEN.trim()) {
    return process.env.WAKE_INVITE_TOKEN.trim();
  }
  if (fs.existsSync(TOKEN_FILE)) {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing.length >= 8) return existing;
  }
  const fresh = crypto.randomBytes(8).toString("hex");
  fs.writeFileSync(TOKEN_FILE, fresh, "utf8");
  return fresh;
}

const INVITE_TOKEN = getOrCreateInviteToken();

function sanitizeSegment(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const map = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      map[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return map;
}

function isLocalHostRequest(req) {
  const forwarded = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"];
  if (forwarded) return false;
  const addr = req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function isAuthorized(req, reqUrl) {
  if (isLocalHostRequest(req)) return true;
  const queryToken = reqUrl.searchParams.get("k");
  const headerToken = req.headers["x-invite-token"];
  const cookieToken = parseCookies(req).aven_invite;
  return (
    queryToken === INVITE_TOKEN ||
    headerToken === INVITE_TOKEN ||
    cookieToken === INVITE_TOKEN
  );
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > 32 * 1024 * 1024) {
        reject(new Error("Payload too large (>32MB)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function listAllClips() {
  const clips = [];
  if (!fs.existsSync(DATASET_DIR)) return clips;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".wav")) {
        const rel = path.relative(DATASET_DIR, full).replace(/\\/g, "/");
        const parts = rel.split("/");
        const [split = "train_real", speaker = "unknown", category = "uncategorized", filename = entry.name] = parts;
        const stat = fs.statSync(full);
        const durationSec = Math.max(0, (stat.size - 44) / 32000);
        clips.push({
          relPath: rel,
          split,
          speaker,
          category,
          filename,
          bytes: stat.size,
          durationSec: Number(durationSec.toFixed(2)),
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  };

  walk(DATASET_DIR);
  clips.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return clips;
}

function validateWavHeader(buf) {
  if (buf.length < 44) return "WAV file shorter than 44-byte header";
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return "Invalid RIFF/WAVE header";
  }
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const channels = buf.readUInt16LE(22);
  if (sampleRate !== 16000) return `Expected 16000Hz sample rate, got ${sampleRate}Hz`;
  if (bitsPerSample !== 16) return `Expected 16-bit PCM, got ${bitsPerSample}-bit`;
  if (channels !== 1) return `Expected mono (1 channel), got ${channels}`;
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const pathname = reqUrl.pathname;

    if (!isAuthorized(req, reqUrl)) {
      if (pathname === "/") {
        res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><body style="background:#111113;color:#f7f5f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="max-width:420px;text-align:center;background:#17171a;border:1px solid #282930;border-radius:14px;padding:24px;"><h2>Invite Link Required</h2><p style="color:#9a978f;font-size:14px;">Ask the LifeOS host to send you the full contributor invite link containing <code>?k=...</code>.</p></div></body></html>`
        );
        return;
      }
      sendJson(res, 403, { error: "Valid invite key required" });
      return;
    }

    if (req.method === "GET" && pathname === "/") {
      const html = fs.readFileSync(HTML_PATH, "utf8");
      const queryToken = reqUrl.searchParams.get("k");
      const headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      };
      if (queryToken === INVITE_TOKEN) {
        headers["Set-Cookie"] = `aven_invite=${encodeURIComponent(INVITE_TOKEN)}; Path=/; HttpOnly; SameSite=Lax`;
      }
      res.writeHead(200, headers);
      res.end(html);
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true, datasetDir: DATASET_DIR });
      return;
    }

    if (req.method === "GET" && pathname === "/api/share-info") {
      if (!isLocalHostRequest(req)) {
        sendJson(res, 200, { isHost: false });
        return;
      }
      let shareData = { isHost: true, publicUrl: null, trainLink: null, blindLink: null, inviteToken: INVITE_TOKEN };
      if (fs.existsSync(PUBLIC_URL_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(PUBLIC_URL_FILE, "utf8"));
          shareData = { ...shareData, ...parsed };
        } catch {}
      }
      sendJson(res, 200, shareData);
      return;
    }

    if (req.method === "GET" && pathname === "/api/clips") {
      const isHost = isLocalHostRequest(req);
      const speakerFilter = sanitizeSegment(reqUrl.searchParams.get("speaker") || "");
      let clips = listAllClips();
      if (!isHost) {
        if (!speakerFilter) {
          clips = [];
        } else {
          clips = clips.filter((c) => c.speaker === speakerFilter);
        }
      }
      sendJson(res, 200, { clips, isHost });
      return;
    }

    if (req.method === "POST" && pathname === "/api/clips") {
      const body = await readJsonBody(req);
      const split = body.split === "val_blind" ? "val_blind" : "train_real";
      const speaker = sanitizeSegment(body.speaker || "contributor") || "contributor";
      const category = sanitizeSegment(body.category || "pos_seated") || "pos_seated";
      const promptText = String(body.promptText || "").trim();
      const wavBase64 = String(body.wavBase64 || "");

      if (!wavBase64) {
        sendJson(res, 400, { error: "Missing wavBase64 payload" });
        return;
      }

      const wavBuf = Buffer.from(wavBase64, "base64");
      const wavError = validateWavHeader(wavBuf);
      if (wavError) {
        sendJson(res, 400, { error: wavError });
        return;
      }

      const targetDir = path.join(DATASET_DIR, split, speaker, category);
      fs.mkdirSync(targetDir, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rand = crypto.randomBytes(2).toString("hex");
      const filename = `${speaker}_${category}_${stamp}_${rand}.wav`;
      const fullPath = path.join(targetDir, filename);
      fs.writeFileSync(fullPath, wavBuf);

      const metaPath = fullPath.replace(/\.wav$/i, ".json");
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            split,
            speaker,
            category,
            promptText,
            accent: String(body.accent || "").trim() || null,
            deviceType: String(body.deviceType || "").trim() || null,
            gender: String(body.gender || "").trim() || null,
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            durationSec: Number(((wavBuf.length - 44) / 32000).toFixed(3)),
            rms: body.rms ?? null,
            peak: body.peak ?? null,
            remoteContributor: !isLocalHostRequest(req),
            createdAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      const relPath = path.relative(DATASET_DIR, fullPath).replace(/\\/g, "/");
      sendJson(res, 201, {
        ok: true,
        relPath,
        durationSec: Number(((wavBuf.length - 44) / 32000).toFixed(2)),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/clip-audio") {
      const rel = String(reqUrl.searchParams.get("path") || "");
      const resolved = path.resolve(DATASET_DIR, rel);
      if (!resolved.startsWith(DATASET_DIR) || !fs.existsSync(resolved) || !resolved.endsWith(".wav")) {
        sendJson(res, 404, { error: "Clip not found" });
        return;
      }
      if (!isLocalHostRequest(req)) {
        const speakerFilter = sanitizeSegment(reqUrl.searchParams.get("speaker") || "");
        const relNormalized = path.relative(DATASET_DIR, resolved).replace(/\\/g, "/");
        const [, clipSpeaker] = relNormalized.split("/");
        if (!speakerFilter || clipSpeaker !== speakerFilter) {
          sendJson(res, 403, { error: "Not permitted to access another speaker's audio" });
          return;
        }
      }
      const data = fs.readFileSync(resolved);
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": String(data.length),
      });
      res.end(data);
      return;
    }

    if (req.method === "DELETE" && pathname === "/api/clips") {
      const rel = String(reqUrl.searchParams.get("path") || "");
      const resolved = path.resolve(DATASET_DIR, rel);
      if (!resolved.startsWith(DATASET_DIR) || !fs.existsSync(resolved) || !resolved.endsWith(".wav")) {
        sendJson(res, 404, { error: "Clip not found" });
        return;
      }
      if (!isLocalHostRequest(req)) {
        const speakerFilter = sanitizeSegment(reqUrl.searchParams.get("speaker") || "");
        const relNormalized = path.relative(DATASET_DIR, resolved).replace(/\\/g, "/");
        const [, clipSpeaker] = relNormalized.split("/");
        if (!speakerFilter || clipSpeaker !== speakerFilter) {
          sendJson(res, 403, { error: "Not permitted to delete another speaker's clip" });
          return;
        }
      }
      fs.unlinkSync(resolved);
      const meta = resolved.replace(/\.wav$/i, ".json");
      if (fs.existsSync(meta)) fs.unlinkSync(meta);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n[Aven Wake Studio] Local Host URL: http://${HOST}:${PORT}`);
  console.log(`[Aven Wake Studio] Saving 16kHz Mono PCM WAVs into: ${DATASET_DIR}`);
  console.log(`[Aven Wake Studio] Invite key loaded (${INVITE_TOKEN}). Use 'pnpm wake:share' to expose free HTTPS URL for friends.\n`);
});
