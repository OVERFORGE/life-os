import { SimulationArtifact, ArtifactKind } from "../contracts/artifactContracts";

export interface RepositoryWriteOptions {
  session?: unknown;
}

/**
 * IArtifactRepository
 *
 * Repository interface for sim_artifacts collection.
 * ExecutionRecorder depends on this interface — not on the concrete Mongo implementation.
 */
export interface IArtifactRepository {
  /** Persist an artifact. Append-only — never updates existing records. */
  persist(artifact: SimulationArtifact, options?: RepositoryWriteOptions): Promise<void>;

  /** Retrieve artifact by its deterministic ID. Returns null if not found. */
  findById(artifactId: string): Promise<SimulationArtifact | null>;

  /** Retrieve all artifacts for a given run and step, ordered by kind. */
  findAllForStep(runUid: string, stepNumber: number): Promise<SimulationArtifact[]>;

  /** Retrieve a specific artifact by run, step, and kind. */
  findByKind(runUid: string, stepNumber: number, kind: ArtifactKind): Promise<SimulationArtifact | null>;
}
