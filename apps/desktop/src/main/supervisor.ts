import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { EventEmitter } from "events";

export interface WakeDetectionEvent {
  event: "wake_detected";
  keyword: string;
  confidence: number;
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

