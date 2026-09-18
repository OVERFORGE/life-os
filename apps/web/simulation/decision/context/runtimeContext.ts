import { RuntimeSnapshot } from "../../types";
import { deriveTimeFromTicks, formatTimestamp } from "../../engine/clock";
import { MAX_CONTEXT_LOGS } from "../constants";
import { SimulatedWorldState, calculateSessionProgress, calculateSessionRemainingMins } from "../../world/contracts/worldStateContracts";

export interface RuntimeContextData {
  tick: number;
  currentDay: number;
  currentMinute: number;
  formattedTime: string;
  formattedTimestamp: string;
  status: string;
  worldState?: SimulatedWorldState;
  recentLogs: Array<{ sequence: number; tick: number; level: string; message: string }>;
}

export function extractRuntimeContext(snapshot: RuntimeSnapshot): RuntimeContextData {
  const derived = deriveTimeFromTicks(
    snapshot.tick,
    snapshot.configuration.startDay,
    snapshot.configuration.startMinute,
    snapshot.configuration.tickIntervalMinutes
  );

  const recentLogs = snapshot.logs.slice(0, MAX_CONTEXT_LOGS).map((l) => ({
    sequence: l.sequence,
    tick: l.tick,
    level: l.level,
    message: l.message,
  }));

  const worldState = (snapshot as any).worldState as SimulatedWorldState | undefined;

  return {
    tick: snapshot.tick,
    currentDay: derived.currentDay,
    currentMinute: derived.currentMinute,
    formattedTime: derived.formattedTime,
    formattedTimestamp: formatTimestamp(derived.currentDay, derived.currentMinute),
    status: snapshot.status,
    worldState,
    recentLogs,
  };
}

export function formatRuntimeContext(snapshot: RuntimeSnapshot): string {
  const data = extractRuntimeContext(snapshot);
  const world = data.worldState;

  const logsFormatted = data.recentLogs
    .map((l) => `  [#${l.sequence} t:${l.tick} ${l.level}] ${l.message}`)
    .join("\n");

  const lines = [
    `CURRENT VIRTUAL TIME: ${data.formattedTimestamp} (Tick: ${data.tick})`,
    `LIFECYCLE STATUS: ${data.status}`,
  ];

  if (world) {
    const b = world.biometrics;
    const session = world.activeSession;
    const sessionProgress = calculateSessionProgress(session);
    const sessionRemaining = calculateSessionRemainingMins(session, world.virtualMinute);

    lines.push(
      `PHYSICAL & MENTAL BIOMETRICS: Energy: ${b.energy}%, Focus: ${b.focus}%, Fatigue: ${b.fatigue}%, Sleep Pressure: ${b.sleepPressure}%, Hunger: ${b.hunger}%, Stress: ${b.stress}%`,
      `ACTIVE ACTIVITY SESSION: ${session ? `${session.title} (${session.definitionId}) — ${sessionProgress}% completed, ${sessionRemaining} mins remaining` : "None"}`,
      `TASK EXECUTION: Task progress (${world.activeTaskProgress}%) | Focus Streak: ${world.executionStreakMins} mins | Location: ${world.location}`
    );
  }

  lines.push(`RECENT EXECUTION LOGS:`, logsFormatted || "  (No logs recorded)");

  return lines.join("\n");
}
