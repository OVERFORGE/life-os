import { RuntimeSnapshot } from "../../types";
import { deriveTimeFromTicks } from "../../engine/clock";
import { SimulationExecutionMetadata } from "../contracts/kernelAdapterContracts";

export function extractExecutionMetadata(snapshot: RuntimeSnapshot): SimulationExecutionMetadata {
  const derived = deriveTimeFromTicks(
    snapshot.tick,
    snapshot.configuration.startDay,
    snapshot.configuration.startMinute,
    snapshot.configuration.tickIntervalMinutes
  );

  return {
    runUid: snapshot.context.runUid,
    tick: snapshot.tick,
    virtualDay: derived.currentDay,
    virtualMinute: derived.currentMinute,
    kernelVersion: snapshot.context.kernelVersion ?? "v2.4.0-deterministic",
    personaCode: snapshot.context.personaCode,
  };
}
