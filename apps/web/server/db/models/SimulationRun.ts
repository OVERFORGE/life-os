import mongoose, { Schema, model, models } from "mongoose";
import { RuntimeSnapshot } from "@/simulation/types";

// ─── Canonical Sub-Schemas ───────────────────────────────────────────────────

const RuntimeContextSchema = new Schema(
  {
    personaId: { type: Schema.Types.ObjectId, ref: "SimulationPersona", required: true },
    personaUid: { type: String, required: true },
    personaCode: { type: String, required: true },
    personaName: { type: String, required: true },
    personaVersion: { type: String, default: "1.0.0" },
    runUid: { type: String, required: true },
    simulationSeed: { type: Number, default: 42 },
    startMinute: { type: Number, default: 480 },
    kernelVersion: { type: String, default: "v2.4.0-deterministic" },
  },
  { _id: false }
);

const RuntimeConfigurationSchema = new Schema(
  {
    startDay: { type: Number, default: 1 },
    startMinute: { type: Number, default: 480 },
    totalDays: { type: Number, default: 1 },
    maxTicks: { type: Number, default: 1440 },
    tickIntervalMinutes: { type: Number, default: 1 },
    speedMultiplier: { type: Number, default: 1 },
    deterministicReplay: { type: Boolean, default: true },
    persistSnapshots: { type: Boolean, default: false },
    enableLogging: { type: Boolean, default: true },
    futureFlags: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const RuntimeMetricsSchema = new Schema(
  {
    elapsedTicks: { type: Number, default: 0 },
    elapsedMinutes: { type: Number, default: 0 },
    pauseCount: { type: Number, default: 0 },
    resumeCount: { type: Number, default: 0 },
    advanceCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const RuntimeLogSchema = new Schema(
  {
    sequence: { type: Number, required: true },
    tick: { type: Number, default: 0 },
    level: {
      type: String,
      enum: ["INFO", "WARN", "ERROR", "DEBUG", "TICK", "LIFECYCLE"],
      default: "INFO",
    },
    message: { type: String, required: true },
    action: { type: String, default: "" },
    details: { type: String, default: "" },
  },
  { _id: false }
);

// ─── Main Canonical Schema ───────────────────────────────────────────────────

const SimulationRunSchema = new Schema(
  {
    runUid: { type: String, required: true, unique: true, index: true },

    personaId: {
      type: Schema.Types.ObjectId,
      ref: "SimulationPersona",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["CREATED", "INITIALIZING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
      default: "CREATED",
      index: true,
    },

    // Canonical execution clock (Requirement 5)
    tick: { type: Number, default: 0 },
    seed: { type: Number, default: 42 },

    configuration: { type: RuntimeConfigurationSchema, required: true },
    context: { type: RuntimeContextSchema, required: true },
    metrics: { type: RuntimeMetricsSchema, default: () => ({}) },
    logs: [RuntimeLogSchema],

    error: { type: String, default: null },
    kernelVersion: { type: String, default: "v2.4.0-deterministic" },
  },
  { timestamps: true }
);

SimulationRunSchema.index({ personaId: 1, status: 1 });

export const SimulationRun =
  models.SimulationRun || model("SimulationRun", SimulationRunSchema);

// ─── Mapper Functions (Requirement 13) ────────────────────────────────────────

/** Maps database document (lean or Mongoose doc) to canonical RuntimeSnapshot */
export function mapDocToSnapshot(doc: any): RuntimeSnapshot {
  return {
    status: doc.status,
    tick: doc.tick ?? 0,
    seed: doc.seed ?? 42,
    configuration: {
      startDay: doc.configuration?.startDay ?? 1,
      startMinute: doc.configuration?.startMinute ?? 480,
      totalDays: doc.configuration?.totalDays ?? 1,
      maxTicks: doc.configuration?.maxTicks ?? 1440,
      tickIntervalMinutes: doc.configuration?.tickIntervalMinutes ?? 1,
      speedMultiplier: doc.configuration?.speedMultiplier ?? 1,
      deterministicReplay: doc.configuration?.deterministicReplay ?? true,
      persistSnapshots: doc.configuration?.persistSnapshots ?? false,
      enableLogging: doc.configuration?.enableLogging ?? true,
      futureFlags: doc.configuration?.futureFlags ?? {},
    },
    context: {
      personaId: doc.context?.personaId?.toString() ?? doc.personaId?.toString() ?? "",
      personaUid: doc.context?.personaUid ?? "",
      personaCode: doc.context?.personaCode ?? "",
      personaName: doc.context?.personaName ?? "",
      personaVersion: doc.context?.personaVersion ?? "1.0.0",
      runUid: doc.context?.runUid ?? doc.runUid ?? "",
      simulationSeed: doc.context?.simulationSeed ?? doc.seed ?? 42,
      startMinute: doc.context?.startMinute ?? 480,
      kernelVersion: doc.context?.kernelVersion ?? "v2.4.0-deterministic",
    },
    metrics: {
      elapsedTicks: doc.metrics?.elapsedTicks ?? 0,
      elapsedMinutes: doc.metrics?.elapsedMinutes ?? 0,
      pauseCount: doc.metrics?.pauseCount ?? 0,
      resumeCount: doc.metrics?.resumeCount ?? 0,
      advanceCount: doc.metrics?.advanceCount ?? 0,
    },
    logs: (doc.logs ?? []).map((l: any, idx: number) => ({
      sequence: l.sequence ?? idx + 1,
      tick: l.tick ?? 0,
      level: l.level ?? "INFO",
      message: l.message ?? l.action ?? "",
      action: l.action ?? "",
      details: l.details ?? "",
    })),
    error: doc.error ?? null,
  };
}

/** Maps a RuntimeSnapshot to plain database persistence object */
export function mapSnapshotToDoc(snapshot: RuntimeSnapshot) {
  return {
    status: snapshot.status,
    tick: snapshot.tick,
    seed: snapshot.seed,
    configuration: snapshot.configuration,
    context: snapshot.context,
    metrics: snapshot.metrics,
    logs: snapshot.logs,
    error: snapshot.error,
  };
}
