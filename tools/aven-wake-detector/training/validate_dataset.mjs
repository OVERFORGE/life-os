import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_DIR = path.join(__dirname, "dataset_real");

function inspectWav(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 44) return { error: "Header shorter than 44 bytes" };
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return { error: "Not a RIFF/WAVE file" };
  }
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  if (channels !== 1 || sampleRate !== 16000 || bitsPerSample !== 16) {
    return { error: `Bad format (${sampleRate}Hz, ${channels}ch, ${bitsPerSample}-bit)` };
  }

  const pcmBytes = buf.length - 44;
  const numSamples = Math.floor(pcmBytes / 2);
  const durationSec = numSamples / 16000;

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    const sample = buf.readInt16LE(44 + i * 2) / 32768;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  const rms = numSamples > 0 ? Math.sqrt(sumSq / numSamples) : 0;

  return { durationSec, peak, rms, error: null };
}

function run() {
  console.log("\n=============================================================");
  console.log("   LIFEOS PHASE 1 DATASET AUDIT (tools/aven-wake-detector)   ");
  console.log("=============================================================");

  if (!fs.existsSync(DATASET_DIR)) {
    console.log(`No dataset_real directory found yet at:\n  ${DATASET_DIR}`);
    console.log("\nRun 'pnpm wake:record' and record your Phase 1 clips first.\n");
    process.exit(0);
  }

  const stats = {
    train_real: { speakers: new Map(), pos: 0, negHard: 0, negAmbientSec: 0 },
    val_blind: { speakers: new Map(), pos: 0, negHard: 0, negAmbientSec: 0 },
  };
  const issues = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".wav")) continue;

      const rel = path.relative(DATASET_DIR, full).replace(/\\/g, "/");
      const [split = "unknown", speaker = "unknown", category = "unknown"] = rel.split("/");
      const info = inspectWav(full);

      if (info.error) {
        issues.push(`${rel}: ${info.error}`);
        continue;
      }
      if (info.peak >= 0.995) {
        issues.push(`${rel}: Peak clipped (${info.peak.toFixed(3)}) — consider re-recording slightly farther from mic`);
      }
      if (category !== "neg_ambient" && info.rms < 0.002) {
        issues.push(`${rel}: Near silence (rms=${info.rms.toFixed(4)})`);
      }
      if (category.startsWith("pos_") && info.durationSec < 0.4) {
        issues.push(`${rel}: Positive clip too short (${info.durationSec.toFixed(2)}s)`);
      }

      const bucket = split === "val_blind" ? stats.val_blind : stats.train_real;
      if (!bucket.speakers.has(speaker)) {
        bucket.speakers.set(speaker, { pos: 0, negHard: 0, negAmbientSec: 0 });
      }
      const spk = bucket.speakers.get(speaker);

      if (category.startsWith("pos_")) {
        bucket.pos++;
        spk.pos++;
      } else if (category === "neg_hard" || category === "neg_hey_names" || category === "neg_free_speech") {
        bucket.negHard++;
        spk.negHard++;
      } else if (category === "neg_ambient") {
        bucket.negAmbientSec += info.durationSec;
        spk.negAmbientSec += info.durationSec;
      }
    }
  };

  walk(DATASET_DIR);

  // Speaker leakage check across splits
  for (const spk of stats.train_real.speakers.keys()) {
    if (stats.val_blind.speakers.has(spk)) {
      issues.push(`SPLIT LEAKAGE: Speaker '${spk}' appears in BOTH train_real and val_blind. Keep blind test speakers completely unseen.`);
    }
  }

  for (const splitName of ["train_real", "val_blind"]) {
    const s = stats[splitName];
    console.log(`\n[${splitName.toUpperCase()}] Total Positives: ${s.pos} | Hard Negatives: ${s.negHard} | Ambient Noise: ${s.negAmbientSec.toFixed(1)}s`);
    for (const [spk, counts] of s.speakers.entries()) {
      console.log(`  - ${spk}: ${counts.pos} pos, ${counts.negHard} hard-neg, ${counts.negAmbientSec.toFixed(1)}s ambient`);
    }
  }

  console.log("\n[PHASE 2 TRAINING READINESS CHECKLIST]");
  const ownerOk = stats.train_real.pos >= 50;
  const hardNegOk = stats.train_real.negHard + stats.val_blind.negHard >= 40;
  const blindSpeakerOk = stats.val_blind.speakers.size >= 1 && stats.val_blind.pos >= 20;
  const ambientOk = stats.train_real.negAmbientSec + stats.val_blind.negAmbientSec >= 60;

  console.log(`  [${ownerOk ? "PASS" : "WAIT"}] Train real positives (>= 50 recommended): ${stats.train_real.pos}`);
  console.log(`  [${hardNegOk ? "PASS" : "WAIT"}] Real hard-negative traps (>= 40 recommended): ${stats.train_real.negHard + stats.val_blind.negHard}`);
  console.log(`  [${blindSpeakerOk ? "PASS" : "WARN"}] Unseen blind speakers in val_blind (>= 1 speaker, >= 20 clips): ${stats.val_blind.speakers.size} speakers, ${stats.val_blind.pos} clips`);
  console.log(`  [${ambientOk ? "PASS" : "WAIT"}] Room baseline ambient audio (>= 60s recommended): ${(stats.train_real.negAmbientSec + stats.val_blind.negAmbientSec).toFixed(1)}s`);

  if (issues.length > 0) {
    console.log(`\n[WARNINGS / FILE ISSUES (${issues.length})]`);
    for (const issue of issues) console.log(`  ! ${issue}`);
  } else {
    console.log("\nZero file format or split leakage issues found.");
  }
  console.log("=============================================================\n");
}

run();

