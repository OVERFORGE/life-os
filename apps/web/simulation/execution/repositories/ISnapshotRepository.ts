import { SimulationStepSnapshot } from "../contracts/snapshotContracts";
import { RepositoryWriteOptions } from "./IArtifactRepository";

/**
 * ISnapshotRepository
 *
 * Repository interface for sim_step_snapshots collection.
 * ExecutionRecorder depends on this interface — not on the concrete Mongo implementation.
 */
export interface ISnapshotRepository {
  /** Persist a step snapshot. Append-only — never updates existing records. */
  persist(snapshot: SimulationStepSnapshot, options?: RepositoryWriteOptions): Promise<void>;

  /** Retrieve a snapshot by its deterministic ID. Returns null if not found. */
  findById(snapshotId: string): Promise<SimulationStepSnapshot | null>;

  /** Retrieve snapshot for a given run + step. Returns null if not found. */
  findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationStepSnapshot | null>;

  /** Retrieve all snapshots for a run, ordered by stepNumber ascending. */
  findAllForRun(runUid: string): Promise<SimulationStepSnapshot[]>;
}
