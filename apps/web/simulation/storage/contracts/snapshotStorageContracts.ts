/**
 * Snapshot Storage Contracts — Versioned Simulation Snapshot DTO Specifications
 *
 * Defines canonical SimulationSnapshot DTO interface and deterministic snapshotId generator.
 */

import { SimulatedWorldState } from "../../world/contracts/worldStateContracts";

export interface VirtualTimestamp {
  day: number;
  minute: number;
}

export interface SimulationSnapshot {
  snapshotId: string; // e.g. "SNP_RUN001_t480_d1_m960"
  runUid: string;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  worldState: Readonly<SimulatedWorldState>;
  worldHash: string;
  virtualTimestamp: VirtualTimestamp;
  metadata?: Record<string, unknown>;
}

/**
 * Derives a strictly deterministic snapshot identifier from execution state.
 * Never uses wall-clock time, UUIDs, PRNG, or process IDs.
 */
export function createDeterministicSnapshotId(
  runUid: string,
  tick: number,
  virtualDay: number,
  virtualMinute: number
): string {
  return `SNP_${runUid}_t${tick}_d${virtualDay}_m${virtualMinute}`;
}
