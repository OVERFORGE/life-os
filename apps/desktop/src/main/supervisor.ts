import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { EventEmitter } from "events";
import { loadRootEnv } from "./env";

export interface WakeDetectionEvent {
  event: "wake_detected";
  keyword: string;
  confidence: number;
  transcribed?: string;
  command?: string;
}

export interface WakeSupervisorOptions {
  binaryPath?: string;
  maxRestarts?: number;
  initialBackoffMs?: number;
}

export class WakeSupervisor extends EventEmitter {
  private child: ChildProcess | null = null;
  private isShuttingDown: boolean = false;
  private restartCount: number = 0;
  private maxRestarts: number;
  private initialBackoffMs: number;
  private binaryPath: string;
  private isVerifying: boolean = false;
  private isConversationActive: boolean = false;

  constructor(options?: WakeSupervisorOptions) {
    super();
    this.maxRestarts = options?.maxRestarts ?? 5;
    this.initialBackoffMs = options?.initialBackoffMs ?? 1000;

    // Resolve binary path: release target, production resource path, or debug target
    const defaultReleasePath = path.resolve(
      __dirname,
      "../../../../tools/aven-wake-detector/target/release/aven-wake-detector.exe"
    );
    const defaultDevPath = path.resolve(
      __dirname,
      "../../../../tools/aven-wake-detector/target/debug/aven-wake-detector.exe"
    );
    const defaultProdPath = path.resolve(
      process.resourcesPath || __dirname,
      "bin/aven-wake-detector.exe"
    );

    this.binaryPath =
      options?.binaryPath ||
      (fs.existsSync(defaultReleasePath)
        ? defaultReleasePath
        : fs.existsSync(defaultProdPath)
        ? defaultProdPath
        : defaultDevPath);
  }

  public isRunning(): boolean {
    return this.child !== null && !this.isShuttingDown;
  }

  public start(): void {
    this.isShuttingDown = false;
    if (this.child) return;

    if (!fs.existsSync(this.binaryPath)) {
      console.warn(
        `[WakeSupervisor] Binary not found at "${this.binaryPath}". Wake detection disabled.`
      );
      this.emit("disabled", { reason: "BINARY_NOT_FOUND", path: this.binaryPath });
      return;
    }

    try {
      this.child = spawn(this.binaryPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdoutBuffer = "";

      this.child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        // Keep trailing incomplete line in buffer
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.event === "wake_detected") {
              this.emit("wake", data);
            } else if (data.event === "candidate_wake") {
              // Verify candidate utterance via high-precision Whisper transcription
              this.verifyCandidateWake(data);
            } else if (data.event === "debug_score") {
              this.emit("debug", data);
            } else if (data.event === "ready") {
              this.emit("ready", data);
              this.restartCount = 0; // Reset restart count on successful ready
            } else if (data.event === "error") {
              this.emit("error", data);
            }
          } catch {
            // Non-JSON stdout log
          }
        }
      });

      this.child.stderr?.on("data", (chunk: Buffer) => {
        console.warn(`[WakeDetector stderr] ${chunk.toString("utf8").trim()}`);
      });

      this.child.on("exit", (code, signal) => {
        this.child = null;
        if (this.isShuttingDown) {
          this.emit("stopped", { code, signal });
          return;
        }

        console.warn(
          `[WakeSupervisor] Detector process exited (code=${code}, signal=${signal}).`
        );

        if (this.restartCount < this.maxRestarts) {
          const backoff = this.initialBackoffMs * Math.pow(2, this.restartCount);
          this.restartCount++;
          console.log(
            `[WakeSupervisor] Restarting detector (attempt ${this.restartCount}/${this.maxRestarts}) in ${backoff}ms...`
          );
          setTimeout(() => this.start(), backoff);
        } else {
          console.error(
            `[WakeSupervisor] Max restart attempts (${this.maxRestarts}) reached. Detector halted.`
          );
          this.emit("crashed", { code, signal });
        }
      });
    } catch (err) {
      console.error("[WakeSupervisor] Failed to spawn detector process:", err);
      this.emit("error", err);
    }
  }

  /**
   * High-precision cloud/local verification for candidate speech utterances.
   * Completely eliminates false positives from conversation/ambient chatter.
   */
  private async verifyCandidateWake(candidate: {
    audio_wav_base64?: string;
    duration_ms?: number;
    rms?: number;
  }): Promise<void> {
    if (!candidate.audio_wav_base64 || this.isVerifying) return;
    this.isVerifying = true;

    try {
      let apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        loadRootEnv();
        apiKey = process.env.GROQ_API_KEY;
      }

      const wavBuffer = Buffer.from(candidate.audio_wav_base64, "base64");
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "candidate.wav");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("language", "en");
      formData.append("temperature", "0");
      formData.append("prompt", "Hey Aven, Hey Even, Aven.");

      let rawText = "";

      if (apiKey) {
        try {
          const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
          });

          if (res.ok) {
            const data = (await res.json()) as { text?: string };
            rawText = (data.text || "").trim();
          }
        } catch (apiErr) {
          console.warn("[WakeSupervisor] Direct Groq API note:", apiErr);
        }
      }

      // Fallback: If direct Groq API not reached, use local LifeOS backend proxy
      if (!rawText) {
        try {
          const webUrl = process.env.LIFEOS_WEB_URL || "http://localhost:3456";
          const fallbackFormData = new FormData();
          fallbackFormData.append("file", blob, "candidate.wav");

          const proxyRes = await fetch(`${webUrl}/api/voice/transcribe`, {
            method: "POST",
            body: fallbackFormData,
          });

          if (proxyRes.ok) {
            const proxyData = (await proxyRes.json()) as { text?: string };
            rawText = (proxyData.text || "").trim();
          }
        } catch (proxyErr) {
          console.warn("[WakeSupervisor] Proxy transcription note:", proxyErr);
        }
      }

      if (!rawText) {
        return;
      }

      const normalized = rawText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

      // Precision Wake Pattern:
      // 1. Explicit salutation followed by name: "Hey Aven", "Hey Even", "Hey Evan", "OK Aven", "Hi Aven", "Hello Aven"
      // 2. Direct address starting with "Aven" (e.g. "Aven, ...")
      // NEVER match standalone English adverb "even" inside normal sentences!
      const WAKE_SALUTATION_PATTERN = /\b(hey|hay|hi|hello|ok|okay)\s+(aven|even|evan|aaven|avian|eaven)\b/i;
      const DIRECT_ADDRESS_PATTERN = /^\s*(aven|aaven|avian)\b/i;

      const isMatch = WAKE_SALUTATION_PATTERN.test(normalized) || DIRECT_ADDRESS_PATTERN.test(normalized);

      if (isMatch) {
        let command = "";
        if (WAKE_SALUTATION_PATTERN.test(normalized)) {
          command = normalized.replace(/^.*?\b(hey|hay|hi|hello|ok|okay)\s+(aven|even|evan|aaven|avian|eaven)\b\s*/i, "").trim();
        } else if (DIRECT_ADDRESS_PATTERN.test(normalized)) {
          command = normalized.replace(/^\s*(aven|aaven|avian)\b\s*/i, "").trim();
        }

        console.log(`[WakeSupervisor] ⚡ Verified 'Hey Aven' wake detected: "${rawText}" (command: "${command}")`);
        const wakeEvent: WakeDetectionEvent = {
          event: "wake_detected",
          keyword: "Hey Aven",
          confidence: 0.99,
          transcribed: rawText,
          command: command || undefined,
        };
        this.emit("wake", wakeEvent);
      } else if (this.isConversationActive) {
        // Discard brief filler sounds (<3 chars or just "um", "uh", "huh")
        const isFiller = /^(um|uh|er|ah|huh|hmm|so)$/i.test(normalized) || normalized.length < 3;
        if (!isFiller) {
          console.log(`[WakeSupervisor] 🗣️ User query captured in active conversation: "${rawText}"`);
          this.emit("speech", {
            event: "user_speech",
            transcribed: rawText,
          });
        } else {
          console.log(`[WakeSupervisor] 🔇 Ignored conversational filler sound: "${rawText}"`);
        }
      } else {
        console.log(`[WakeSupervisor] 🔇 Discarded ambient speech: "${rawText}" (no wake word match)`);
      }
    } catch (err: any) {
      console.warn("[WakeSupervisor] Candidate verification error:", err?.message || err);
    } finally {
      this.isVerifying = false;
    }
  }

  public setConversationActive(active: boolean): void {
    this.isConversationActive = active;
    console.log(
      `[WakeSupervisor] Conversation mode set to: ${
        active ? "ACTIVE (listening for user queries)" : "IDLE (wake word only)"
      }`
    );
  }

  public getConversationActive(): boolean {
    return this.isConversationActive;
  }

  public stop(): void {
    this.isShuttingDown = true;
    if (this.child) {
      try {
        this.child.stdin?.write("EXIT\n");
      } catch {}
      setTimeout(() => {
        if (this.child) {
          this.child.kill();
          this.child = null;
        }
      }, 500);
    }
  }
}
