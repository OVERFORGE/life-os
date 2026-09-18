/**
 * Runtime Context Module — Phase 1.3
 * Immutable session context definitions and deterministic runUid generator.
 */

import { RuntimeContextDTO, SimulationPersonaDTO } from "../types";

export function generateRunUid(personaCode: string = "FOUNDER", sequenceNumber: number = 1): string {
  const cleanCode = (personaCode || "FOUNDER").toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const padSeq = String(Math.max(1, sequenceNumber)).padStart(4, "0");
  return `RUN_${cleanCode}_${padSeq}`;
}

export function buildRuntimeContext(
  persona: SimulationPersonaDTO,
  runUid: string,
  seed: number = 42,
  startMinute: number = 480
): Readonly<RuntimeContextDTO> {
  return Object.freeze({
    personaId: persona.id,
    personaUid: persona.personaUid,
    personaCode: persona.code,
    personaName: persona.name,
    personaVersion: persona.personaVersion ?? "1.0.0",
    runUid,
    simulationSeed: seed,
    startMinute,
    kernelVersion: "v2.4.0-deterministic",
  });
}
