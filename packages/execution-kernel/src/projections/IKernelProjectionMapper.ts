import { KernelSnapshot } from "../worldv2/KernelSnapshot";
import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

/**
 * Canonical Projection Mapper Contract (Phase B4 DTO Layer)
 * 
 * All external DTO mappers must implement this contract to ensure pure, read-only,
 * deterministic projections from KernelSnapshot.
 * 
 * CONSTITUTIONAL RULES:
 * - Pure Read-Only Projection: Zero business math, zero heuristics, zero DB queries.
 * - Deterministic & Replay-Safe: Derives timestamps from snapshot metadata.
 * - Deeply Frozen: Returns read-only immutable DTO payloads.
 */
export interface IKernelProjectionMapper<TDTO> {
  project(
    snapshot: KernelSnapshot,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<TDTO>;
}
