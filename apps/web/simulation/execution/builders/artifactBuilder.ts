/**
 * ArtifactBuilder — Phase 1.7 V2
 *
 * Pure object constructor for SimulationArtifact.
 * No I/O, no side effects, no imports from persistence layer.
 */

import {
  SimulationArtifact,
  ArtifactKind,
  ARTIFACT_SCHEMA_VERSION,
} from "../contracts/artifactContracts";

/** Maps ArtifactKind to its payload type name (used for payloadType field) */
const KIND_TO_PAYLOAD_TYPE: Record<ArtifactKind, string> = {
  PROMPT_DOCUMENT: "PromptDocument",
  LLM_RAW_RESPONSE: "LLMResponse",
  DECISION_DTO: "DecisionDTO",
  VIRTUAL_USER_REQUEST: "VirtualUserRequest",
  HANDLE_INPUT: "HandleInput",
  KERNEL_RESULT: "SimulationKernelResult",
  WORLD_SNAPSHOT_BEFORE: "WorldSnapshot",
  WORLD_SNAPSHOT_AFTER: "WorldSnapshot",
  WORLD_SNAPSHOT_DIFF: "WorldSnapshotDiff",
  DIAGNOSTICS: "Diagnostics",
  RUNTIME_SNAPSHOT: "RuntimeSnapshot",
  PERSONA_DTO: "SimulationPersonaDTO",
};

const PAYLOAD_VERSION = "1";

/**
 * Generates future-proof deterministic artifact ID with sequence support.
 * Format: ART_{runUid}_{stepNumber}_{kind}_{sequence}
 */
export function buildArtifactId(
  runUid: string,
  stepNumber: number,
  kind: ArtifactKind,
  sequence: string = "01"
): string {
  return `ART_${runUid}_${stepNumber}_${kind}_${sequence}`;
}

export function buildArtifact(
  runUid: string,
  stepNumber: number,
  kind: ArtifactKind,
  payload: Record<string, unknown>,
  createdAtVirtualMinute: number,
  sequence: string = "01"
): SimulationArtifact {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    artifactId: buildArtifactId(runUid, stepNumber, kind, sequence),
    runUid,
    stepNumber,
    kind,
    payloadType: KIND_TO_PAYLOAD_TYPE[kind],
    payloadVersion: PAYLOAD_VERSION,
    payload,
    createdAtVirtualMinute,
  };
}
