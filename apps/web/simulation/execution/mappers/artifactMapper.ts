/**
 * ArtifactMapper — Phase 1.7 V2
 *
 * Pure functions for safe serialization of artifact payloads for UI consumption.
 * Mongo documents must never leak outside the persistence layer.
 * No I/O.
 */

import { SimulationArtifact, ArtifactKind } from "../contracts/artifactContracts";

/**
 * Extracts the typed payload from an artifact for inspector display.
 * Returns null if the artifact is null (optional artifact kinds).
 */
export function toInspectorPayload(artifact: SimulationArtifact | null): Record<string, unknown> | null {
  if (!artifact) return null;
  return artifact.payload;
}

/**
 * Extracts payloads for multiple artifacts in a single map operation.
 * Returns a partial record — only includes kinds that were provided.
 */
export function toInspectorPayloadMap(
  artifacts: Partial<Record<ArtifactKind, SimulationArtifact | null>>
): Partial<Record<ArtifactKind, Record<string, unknown> | null>> {
  const result: Partial<Record<ArtifactKind, Record<string, unknown> | null>> = {};
  for (const [kind, artifact] of Object.entries(artifacts)) {
    result[kind as ArtifactKind] = artifact ? artifact.payload : null;
  }
  return result;
}
