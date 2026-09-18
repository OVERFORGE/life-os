/**
 * SnapshotRepository — Phase 1.7 V2
 *
 * Concrete MongoDB implementation of ISnapshotRepository.
 * Operates on the sim_step_snapshots collection.
 * Append-only. Never updates existing records.
 */

import { SimulationStepSnapshot, ExecutionStatus } from "../contracts/snapshotContracts";
import { KernelFailureCategory } from "../../integration/contracts/kernelResultContracts";
import { ISnapshotRepository } from "./ISnapshotRepository";
import { RepositoryWriteOptions } from "./IArtifactRepository";
import { SimulationStepSnapshotModel } from "@/server/db/models/SimulationStepSnapshotModel";

interface SnapshotDocument {
  schemaVersion: "1.0.0";
  snapshotId: string;
  runUid: string;
  stepNumber: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  timestampVirtual: string;
  personaId: string;
  personaCode: string;
  decisionIntent: string;
  executionStatus?: ExecutionStatus;
  kernelSuccess: boolean;
  failureCategory?: string | null;
  executionDurationMs?: number;
  traceId: string;
  promptArtifactId: string;
  llmResponseArtifactId: string;
  decisionArtifactId: string;
  virtualRequestArtifactId: string;
  handleInputArtifactId: string;
  kernelResultArtifactId: string;
  worldBeforeArtifactId: string | null;
  worldAfterArtifactId: string | null;
  diagnosticsArtifactId: string | null;
  metadata: {
    kernelVersion: string;
    pipelineVersion: string;
    llmProvider: string;
    llmModel: string;
  };
}

export class SnapshotRepository implements ISnapshotRepository {
  async persist(snapshot: SimulationStepSnapshot, options?: RepositoryWriteOptions): Promise<void> {
    await SimulationStepSnapshotModel.replaceOne(
      { snapshotId: snapshot.snapshotId },
      snapshot,
      { upsert: true, session: options?.session as any }
    );
  }

  async findById(snapshotId: string): Promise<SimulationStepSnapshot | null> {
    const doc = await SimulationStepSnapshotModel.findOne({ snapshotId }).lean<SnapshotDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  async findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationStepSnapshot | null> {
    const doc = await SimulationStepSnapshotModel
      .findOne({ runUid, stepNumber })
      .lean<SnapshotDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  async findAllForRun(runUid: string): Promise<SimulationStepSnapshot[]> {
    const docs = await SimulationStepSnapshotModel
      .find({ runUid })
      .sort({ stepNumber: 1 })
      .lean<SnapshotDocument[]>();
    return docs.map((d) => this._toContract(d));
  }

  private _toContract(doc: SnapshotDocument): SimulationStepSnapshot {
    return {
      schemaVersion:            doc.schemaVersion,
      snapshotId:               doc.snapshotId,
      runUid:                   doc.runUid,
      stepNumber:               doc.stepNumber,
      tick:                     doc.tick,
      virtualDay:               doc.virtualDay,
      virtualMinute:            doc.virtualMinute,
      timestampVirtual:         doc.timestampVirtual,
      personaId:                doc.personaId,
      personaCode:              doc.personaCode,
      decisionIntent:           doc.decisionIntent,
      executionStatus:          doc.executionStatus ?? (doc.kernelSuccess ? "SUCCESS" : "FAILED"),
      kernelSuccess:            doc.kernelSuccess,
      failureCategory:          (doc.failureCategory as KernelFailureCategory) ?? null,
      executionDurationMs:      doc.executionDurationMs ?? 0,
      traceId:                  doc.traceId,
      promptArtifactId:         doc.promptArtifactId,
      llmResponseArtifactId:    doc.llmResponseArtifactId,
      decisionArtifactId:       doc.decisionArtifactId,
      virtualRequestArtifactId: doc.virtualRequestArtifactId,
      handleInputArtifactId:    doc.handleInputArtifactId,
      kernelResultArtifactId:   doc.kernelResultArtifactId,
      worldBeforeArtifactId:    doc.worldBeforeArtifactId ?? null,
      worldAfterArtifactId:     doc.worldAfterArtifactId ?? null,
      diagnosticsArtifactId:    doc.diagnosticsArtifactId ?? null,
      metadata:                 doc.metadata,
    };
  }
}

