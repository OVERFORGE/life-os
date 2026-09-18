/**
 * TraceRepository — Phase 1.7 V2
 *
 * Concrete MongoDB implementation of ITraceRepository.
 * Operates on the sim_execution_traces collection.
 * Append-only. Never updates existing records.
 */

import { SimulationExecutionTrace, ExecutionStage } from "../contracts/executionTraceContracts";
import { ITraceRepository } from "./ITraceRepository";
import { RepositoryWriteOptions } from "./IArtifactRepository";
import { SimulationExecutionTraceModel } from "@/server/db/models/SimulationExecutionTrace";

interface TraceDocument {
  schemaVersion: "1.0.0";
  traceId: string;
  runUid: string;
  stepNumber: number;
  startedAtVirtualMinute: number;
  finishedAtVirtualMinute: number;
  stages: ExecutionStage[];
  summary: {
    success: boolean;
    totalDurationMs: number;
    kernelInvoked: boolean;
    decisionGenerated: boolean;
    snapshotPersisted: boolean;
  };
}

export class TraceRepository implements ITraceRepository {
  async persist(trace: SimulationExecutionTrace, options?: RepositoryWriteOptions): Promise<void> {
    await SimulationExecutionTraceModel.replaceOne(
      { traceId: trace.traceId },
      trace,
      { upsert: true, session: options?.session as any }
    );
  }

  async findById(traceId: string): Promise<SimulationExecutionTrace | null> {
    const doc = await SimulationExecutionTraceModel.findOne({ traceId }).lean<TraceDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  async findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationExecutionTrace | null> {
    const doc = await SimulationExecutionTraceModel
      .findOne({ runUid, stepNumber })
      .lean<TraceDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  private _toContract(doc: TraceDocument): SimulationExecutionTrace {
    return {
      schemaVersion:           doc.schemaVersion,
      traceId:                 doc.traceId,
      runUid:                  doc.runUid,
      stepNumber:              doc.stepNumber,
      startedAtVirtualMinute:  doc.startedAtVirtualMinute,
      finishedAtVirtualMinute: doc.finishedAtVirtualMinute,
      stages:                  doc.stages,
      summary:                 doc.summary,
    };
  }
}
