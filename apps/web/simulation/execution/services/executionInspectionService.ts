/**
 * ExecutionInspectionService — Phase 1.7 V2
 *
 * Reconstructs complete inspection views from immutable artifacts.
 * NEVER returns Mongo documents — always returns DTOs.
 * UI never performs joins; this service does all reconstruction.
 */

import { SimulationStepSnapshot } from "../contracts/snapshotContracts";
import { SimulationExecutionTrace } from "../contracts/executionTraceContracts";
import { TimelineEntryDTO } from "../contracts/journalContracts";

import { ISnapshotRepository } from "../repositories/ISnapshotRepository";
import { ITraceRepository } from "../repositories/ITraceRepository";
import { IArtifactRepository } from "../repositories/IArtifactRepository";
import { IJournalRepository } from "../repositories/IJournalRepository";

import { SnapshotRepository } from "../repositories/snapshotRepository";
import { TraceRepository } from "../repositories/traceRepository";
import { ArtifactRepository } from "../repositories/artifactRepository";
import { JournalRepository } from "../repositories/journalRepository";

import { toTimeline } from "../mappers/timelineMapper";
import { toInspectorPayload } from "../mappers/artifactMapper";

// ─── Inspection DTO ───────────────────────────────────────────────────────────

export interface ExecutionInspectionDTO {
  /** Canonical state record for this step — no embedded payloads */
  snapshot: SimulationStepSnapshot;
  /** Execution stage sequence — no embedded payloads */
  trace: SimulationExecutionTrace;
  /** All artifact payloads, reconstructed from sim_artifacts */
  artifacts: {
    prompt:          Record<string, unknown> | null;
    llmResponse:     Record<string, unknown> | null;
    decision:        Record<string, unknown> | null;
    virtualRequest:  Record<string, unknown> | null;
    handleInput:     Record<string, unknown> | null;
    kernelResult:    Record<string, unknown> | null;
    worldBefore:     Record<string, unknown> | null;
    worldAfter:      Record<string, unknown> | null;
    diff:            Record<string, unknown> | null;
    diagnostics:     Record<string, unknown> | null;
    runtimeSnapshot: Record<string, unknown> | null;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ExecutionInspectionService {
  constructor(
    private readonly snapshotRepo: ISnapshotRepository = new SnapshotRepository(),
    private readonly traceRepo: ITraceRepository = new TraceRepository(),
    private readonly artifactRepo: IArtifactRepository = new ArtifactRepository(),
    private readonly journalRepo: IJournalRepository = new JournalRepository()
  ) {}

  /**
   * Full inspection DTO for a given run + step.
   * Reconstructs snapshot → trace → all artifacts → composes ExecutionInspectionDTO.
   */
  async getStep(runUid: string, stepNumber: number): Promise<ExecutionInspectionDTO | null> {
    const snapshot = await this.snapshotRepo.findByRunAndStep(runUid, stepNumber);
    if (!snapshot) return null;

    const trace = await this.traceRepo.findById(snapshot.traceId);
    if (!trace) return null;

    // Fetch all artifacts in parallel
    const [
      promptArt,
      llmResponseArt,
      decisionArt,
      virtualRequestArt,
      handleInputArt,
      kernelResultArt,
      worldBeforeArt,
      worldAfterArt,
      diagnosticsArt,
      runtimeSnapshotArt,
    ] = await Promise.all([
      this.artifactRepo.findById(snapshot.promptArtifactId),
      this.artifactRepo.findById(snapshot.llmResponseArtifactId),
      this.artifactRepo.findById(snapshot.decisionArtifactId),
      this.artifactRepo.findById(snapshot.virtualRequestArtifactId),
      this.artifactRepo.findById(snapshot.handleInputArtifactId),
      this.artifactRepo.findById(snapshot.kernelResultArtifactId),
      snapshot.worldBeforeArtifactId ? this.artifactRepo.findById(snapshot.worldBeforeArtifactId) : Promise.resolve(null),
      snapshot.worldAfterArtifactId  ? this.artifactRepo.findById(snapshot.worldAfterArtifactId)  : Promise.resolve(null),
      snapshot.diagnosticsArtifactId ? this.artifactRepo.findById(snapshot.diagnosticsArtifactId) : Promise.resolve(null),
      this.artifactRepo.findByKind(runUid, stepNumber, "RUNTIME_SNAPSHOT"),
    ]);

    // Diff is stored in WORLD_SNAPSHOT_DIFF artifact if world was present
    const diffArt = snapshot.worldAfterArtifactId
      ? await this.artifactRepo.findByKind(runUid, stepNumber, "WORLD_SNAPSHOT_DIFF")
      : null;

    return {
      snapshot,
      trace,
      artifacts: {
        prompt:          toInspectorPayload(promptArt),
        llmResponse:     toInspectorPayload(llmResponseArt),
        decision:        toInspectorPayload(decisionArt),
        virtualRequest:  toInspectorPayload(virtualRequestArt),
        handleInput:     toInspectorPayload(handleInputArt),
        kernelResult:    toInspectorPayload(kernelResultArt),
        worldBefore:     toInspectorPayload(worldBeforeArt),
        worldAfter:      toInspectorPayload(worldAfterArt),
        diff:            toInspectorPayload(diffArt),
        diagnostics:     toInspectorPayload(diagnosticsArt),
        runtimeSnapshot: toInspectorPayload(runtimeSnapshotArt),
      },
    };
  }

  /** Timeline — delegates to journal. Never loads snapshots or artifacts. */
  async getTimeline(runUid: string): Promise<TimelineEntryDTO[]> {
    const entries = await this.journalRepo.findAllForRun(runUid);
    return toTimeline(entries);
  }

  async getDecision(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "DECISION_DTO");
    return toInspectorPayload(art);
  }

  async getPrompt(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "PROMPT_DOCUMENT");
    return toInspectorPayload(art);
  }

  async getHandleInput(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "HANDLE_INPUT");
    return toInspectorPayload(art);
  }

  async getKernelResult(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "KERNEL_RESULT");
    return toInspectorPayload(art);
  }

  async getDiagnostics(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "DIAGNOSTICS");
    return toInspectorPayload(art);
  }

  async getDiff(runUid: string, stepNumber: number): Promise<Record<string, unknown> | null> {
    const art = await this.artifactRepo.findByKind(runUid, stepNumber, "WORLD_SNAPSHOT_DIFF");
    return toInspectorPayload(art);
  }

  async getRawTrace(runUid: string, stepNumber: number): Promise<SimulationExecutionTrace | null> {
    return this.traceRepo.findByRunAndStep(runUid, stepNumber);
  }
}
