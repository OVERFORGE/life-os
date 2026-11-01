/**
 * outbox-worker-daemon.ts
 * 
 * Standalone background worker process for LifeOS Outbox Dispatching.
 * Milestone B — Step 2 V2.2 Canonical Worker Daemon.
 */

import mongoose from "mongoose";
import { OutboxWorkerDaemon } from "../packages/execution-kernel/src/events/dispatch/OutboxWorkerService";

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/life-os";
  console.log(`[DAEMON] Connecting to MongoDB: ${mongoUri.replace(/:([^:@]+)@/, ":****@")}`);
  await mongoose.connect(mongoUri);

  const daemon = new OutboxWorkerDaemon({ pollIntervalMs: 1000, batchSize: 25 });
  console.log(`[DAEMON] Started with worker ID: ${daemon.getHealth().workerId}`);

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[DAEMON] Received ${signal}. Draining active tasks and stopping...`);
    daemon.stop();
    await mongoose.disconnect();
    console.log("[DAEMON] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await daemon.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[DAEMON FATAL]", err);
    process.exit(1);
  });
}
