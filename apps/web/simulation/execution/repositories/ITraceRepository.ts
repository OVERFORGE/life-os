import { SimulationExecutionTrace } from "../contracts/executionTraceContracts";
import { RepositoryWriteOptions } from "./IArtifactRepository";

/**
 * ITraceRepository
 *
 * Repository interface for sim_execution_traces collection.
 * ExecutionRecorder depends on this interface — not on the concrete Mongo implementation.
 */
export interface ITraceRepository {
  /** Persist an execution trace. Append-only — never updates existing records. */
  persist(trace: SimulationExecutionTrace, options?: RepositoryWriteOptions): Promise<void>;

  /** Retrieve a trace by its deterministic ID. Returns null if not found. */
  findById(traceId: string): Promise<SimulationExecutionTrace | null>;

  /** Retrieve trace for a given run + step. Returns null if not found. */
  findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationExecutionTrace | null>;
}
