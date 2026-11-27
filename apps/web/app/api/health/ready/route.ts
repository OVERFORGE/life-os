import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { resolveGroqModel } from "@life-os/execution-kernel";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbReadyState = typeof mongoose.connection?.readyState === "number" ? mongoose.connection.readyState : 0;
  const rawDbName = mongoose.connection?.db?.databaseName;
  const dbName = rawDbName ? String(rawDbName).split(/[/?@]/).pop() || "unknown" : "disconnected";
  const isReady = dbReadyState === 1;

  return NextResponse.json(
    {
      status: isReady ? "ready" : "degraded",
      dbReadyState,
      dbName,
      activeDefaultModel: resolveGroqModel(),
      localEmbeddingsMode: process.env.LIFEOS_LOCAL_EMBEDDINGS || "default",
      timestamp: new Date().toISOString(),
    },
    { status: isReady ? 200 : 503 }
  );
}
