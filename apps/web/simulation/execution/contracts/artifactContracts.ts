/**
 * Artifact Contracts — Phase 1.7 V2
 *
 * Defines immutable artifact types for the Simulation Lab observability system.
 * Artifacts are the sole owners of heavyweight payload data.
 * All other records (trace, snapshot, journal) reference artifacts by ID only.
 */

export const ARTIFACT_SCHEMA_VERSION = "1.0.0" as const;

/**
 * Every distinct heavyweight payload kind that can be stored as an artifact.
 */
export type ArtifactKind =
  | "PROMPT_DOCUMENT"
  | "LLM_RAW_RESPONSE"
  | "DECISION_DTO"
  | "VIRTUAL_USER_REQUEST"
  | "HANDLE_INPUT"
  | "KERNEL_RESULT"
  | "WORLD_SNAPSHOT_BEFORE"
  | "WORLD_SNAPSHOT_AFTER"
  | "WORLD_SNAPSHOT_DIFF"
  | "DIAGNOSTICS"
  | "RUNTIME_SNAPSHOT"
  | "PERSONA_DTO";

/**
 * Maps ArtifactKind to its payload type name and version for future-safe deserialization.
 */
export interface ArtifactPayloadMeta {
  /** Human-readable payload type name, matching the TS interface (e.g. "PromptDocument") */
  payloadType: string;
  /** Payload schema version — enables deserialization migration */
  payloadVersion: string;
}

/**
 * Canonical immutable artifact record.
 *
 * - Append-only: never updated, never overwritten.
 * - artifactId is deterministic: `ART_{runUid}_{stepNumber}_{kind}`
 * - Independently reconstructable: contains runUid + stepNumber directly.
 */
export interface SimulationArtifact {
  /** Schema version for this artifact document */
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;

  /** Deterministic ID: ART_{runUid}_{stepNumber}_{kind} */
  artifactId: string;

  /** Parent run UID — for independent reconstruction without DB joins */
  runUid: string;

  /** Parent step number */
  stepNumber: number;

  /** Discriminant kind — determines how payload is deserialized */
  kind: ArtifactKind;

  /** Payload type name for future-safe deserialization */
  payloadType: string;

  /** Payload schema version */
  payloadVersion: string;

  /** The actual heavyweight content */
  payload: Record<string, unknown>;

  /** Virtual clock minute at time of creation */
  createdAtVirtualMinute: number;
}
