/**
 * ExecutionRecorder -- Phase 1.7 V2
 *
 * Application Service. Sole owner of observability persistence orchestration.
 *
 * ARCHITECTURAL RULES:
 * - This service NEVER modifies execution behavior.
 * - This service NEVER imports Kernel internals (Planner, Dispatcher, LearningEngine,
 *   WorldModel, AdaptiveRepairEngine, or any internal Kernel subsystem).
 * - The only Kernel-produced data this service touches is the already-computed
 *   SimulationKernelResult returned by SimulationKernelAdapter.
 * - All heavy payloads are stored as artifacts. Snapshots and traces reference IDs only.
 * - postRecordHooks[] provides a zero-cost extension point for future Analytics,
 *   Validation, Regression, and Benchmark subscribers.
 *
 * Retention Policy (documented, not implemented):
 * - Production simulations: retain artifacts forever.
 * - Temporary / development simulations: configurable retention via future cleanup job.
 * - Artifacts are never retroactively modified.
 */

import mongoose from "mongoose";
import { PromptDocument, LLMResponse } from "../../decision/contracts/decisionContracts";
import { DecisionDTO } from "../../decision/schema/decisionSchema";
import { SimulationKernelResult, KernelFailureCategory, KernelFailureDetail } from "../../integration/contracts/kernelResultContracts";
import { ExecutionStatus } from "../contracts/snapshotContracts";
import { RuntimeSnapshot, SimulationPersonaDTO } from "../../types";

import { buildArtifact } from "../builders/artifactBuilder";
import { ExecutionTraceBuilder, buildTraceId } from "../builders/executionTraceBuilder";
import { buildSnapshot } from "../builders/snapshotBuilder";
import { buildJournalEntry } from "../builders/journalBuilder";
import { computeDiff, diffToPayload } from "../mappers/diffMapper";
import { SnapshotHasher } from "./snapshotHasher";

import { IArtifactRepository } from "../repositories/IArtifactRepository";
import { ITraceRepository } from "../repositories/ITraceRepository";
import { ISnapshotRepository } from "../repositories/ISnapshotRepository";
import { IJournalRepository } from "../repositories/IJournalRepository";

import { ArtifactRepository } from "../repositories/artifactRepository";
import { TraceRepository } from "../repositories/traceRepository";
import { SnapshotRepository } from "../repositories/snapshotRepository";
import { JournalRepository } from "../repositories/journalRepository";

import { SimulationStepSnapshot } from "../contracts/snapshotContracts";
import { KERNEL_PIPELINE_VERSION } from "../../integration/constants";
import { deriveTimeFromTicks } from "../../engine/clock";

// --- Public contracts --------------------------------------------------------

export interface ExecutionRecordInput {
  snapshot: RuntimeSnapshot;
  persona: SimulationPersonaDTO;
  stepNumber: number;
  promptDocument: PromptDocument | null;
  llmResponse: LLMResponse | null;
  decision: DecisionDTO | null;
  virtualUserRequest: string | null;
  /** The exact HandleInput sent to Kernel.handle() */
  handleInput: { userId: string; conversationId?: string; message: string; model?: string; mode?: string } | null;
  kernelResult: SimulationKernelResult;
  /** Real world snapshot from prior step (if available) */
  previousWorldSnapshot?: Record<string, unknown> | null;
}

export interface ExecutionRecordResult {
  snapshotId: string;
  traceId: string;
  journalEntryId: string;
}

/** Post-record hook -- called after all persistence is complete. Never blocks recording. */
export type PostRecordHook = (snapshot: SimulationStepSnapshot) => Promise<void> | void;

// --- ExecutionRecorder -------------------------------------------------------

export class ExecutionRecorder {
  /** Extension point for Analytics, Validation, Regression, Benchmark subscribers. */
  private postRecordHooks: PostRecordHook[] = [];

  constructor(
    private readonly artifactRepo: IArtifactRepository = new ArtifactRepository(),
    private readonly traceRepo: ITraceRepository = new TraceRepository(),
    private readonly snapshotRepo: ISnapshotRepository = new SnapshotRepository(),
    private readonly journalRepo: IJournalRepository = new JournalRepository()
  ) {}

  /** Register a post-record hook. Hooks are called in registration order. */
  addHook(hook: PostRecordHook): void {
    this.postRecordHooks.push(hook);
  }

  /**
   * Records a complete simulation step as immutable, split artifacts.
   */
  async record(input: ExecutionRecordInput): Promise<ExecutionRecordResult> {
    const recordStartTime = Date.now();
    let totalPersistDurationMs = 0;
    let totalArtifactsPersisted = 0;
    let totalRepoWrites = 0;

    let session: mongoose.ClientSession | null = null;
    try {
      if (mongoose.connection.readyState === 1) {
        session = await mongoose.startSession();
        session.startTransaction();
      }
    } catch (_sessionErr) {
      session = null;
    }

    const writeOpts = session ? { session } : undefined;

    try {
      const {
        snapshot,
        persona,
        stepNumber,
        promptDocument,
        llmResponse,
        decision,
        virtualUserRequest,
        handleInput,
        kernelResult,
        previousWorldSnapshot,
      } = input;

      const runUid = snapshot.context.runUid;
      const derivedTime = deriveTimeFromTicks(
        snapshot.tick,
        snapshot.configuration.startDay,
        snapshot.configuration.startMinute,
        snapshot.configuration.tickIntervalMinutes
      );
      const virtualDay = derivedTime.currentDay;
      const virtualMinute = derivedTime.currentMinute;

      const traceBuilder = new ExecutionTraceBuilder(runUid, stepNumber, virtualMinute);

      // Stage 1: RUNTIME_SNAPSHOT_LOADED
      let stageStart = Date.now();
      const runtimePayload = snapshot as unknown as Record<string, unknown>;
      const runtimeArtifact = buildArtifact(runUid, stepNumber, "RUNTIME_SNAPSHOT", runtimePayload, virtualMinute);
      let pStart = Date.now();
      await this.artifactRepo.persist(runtimeArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("RUNTIME_SNAPSHOT_LOADED", "SUCCESS", stageStart, {
        outputArtifactId: runtimeArtifact.artifactId,
      });

      // Stage 2: PERSONA_LOADED
      stageStart = Date.now();
      const personaPayload = persona as unknown as Record<string, unknown>;
      const personaArtifact = buildArtifact(runUid, stepNumber, "PERSONA_DTO", personaPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(personaArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("PERSONA_LOADED", "SUCCESS", stageStart, {
        inputArtifactId: runtimeArtifact.artifactId,
        outputArtifactId: personaArtifact.artifactId,
      });

      // Stage 3: PROMPT_BUILT
      const promptPayload = promptDocument
        ? (promptDocument as unknown as Record<string, unknown>)
        : { systemPrompt: "Autonomous execution (LLM gated)", serializedPrompt: "Autonomous step execution without LLM prompt" };
      const promptArtifact = buildArtifact(runUid, stepNumber, "PROMPT_DOCUMENT", promptPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(promptArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("PROMPT_BUILT", "SUCCESS", stageStart, {
        inputArtifactId: runtimeArtifact.artifactId,
        outputArtifactId: promptArtifact.artifactId,
      });

      // Stage 4: LLM_REQUEST
      stageStart = Date.now();
      const llmResponsePayload = llmResponse ? (llmResponse as unknown as Record<string, unknown>) : { rawResponse: "", provider: "unknown", model: "unknown" };
      const llmArtifact = buildArtifact(runUid, stepNumber, "LLM_RAW_RESPONSE", llmResponsePayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(llmArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("LLM_REQUEST", llmResponse ? "SUCCESS" : "FAILED", stageStart, {
        inputArtifactId: promptArtifact.artifactId,
        outputArtifactId: llmArtifact.artifactId,
        notes: llmResponse ? "provider=" + llmResponse.provider + ", model=" + llmResponse.model : "LLM response was null",
      });

      // Stage 5: DECISION_PARSED
      stageStart = Date.now();
      const decisionPayload = decision ? (decision as unknown as Record<string, unknown>) : { error: "Decision parsing failed" };
      const decisionArtifact = buildArtifact(runUid, stepNumber, "DECISION_DTO", decisionPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(decisionArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("DECISION_PARSED", decision ? "SUCCESS" : "FAILED", stageStart, {
        inputArtifactId: llmArtifact.artifactId,
        outputArtifactId: decisionArtifact.artifactId,
        notes: decision ? "intent=" + decision.intent + ", confidence=" + decision.confidence : "Decision was null",
      });

      // Stage 6: VIRTUAL_USER_REQUEST_BUILT
      stageStart = Date.now();
      const virtualRequestPayload: Record<string, unknown> = { requestText: virtualUserRequest ?? "" };
      const virtualRequestArtifact = buildArtifact(runUid, stepNumber, "VIRTUAL_USER_REQUEST", virtualRequestPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(virtualRequestArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("VIRTUAL_USER_REQUEST_BUILT", virtualUserRequest ? "SUCCESS" : "FAILED", stageStart, {
        inputArtifactId: decisionArtifact.artifactId,
        outputArtifactId: virtualRequestArtifact.artifactId,
      });

      // Stage 7: KERNEL_ADAPTER
      stageStart = Date.now();
      const handleInputPayload = handleInput ? (handleInput as unknown as Record<string, unknown>) : { message: "" };
      const handleInputArtifact = buildArtifact(runUid, stepNumber, "HANDLE_INPUT", handleInputPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(handleInputArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      traceBuilder.recordStage("KERNEL_ADAPTER", handleInput ? "SUCCESS" : "FAILED", stageStart, {
        inputArtifactId: virtualRequestArtifact.artifactId,
        outputArtifactId: handleInputArtifact.artifactId,
      });

      // Stage 8: KERNEL_INVOCATION
      stageStart = Date.now();
      const kernelResultPayload = kernelResult as unknown as Record<string, unknown>;
      const kernelResultArtifact = buildArtifact(runUid, stepNumber, "KERNEL_RESULT", kernelResultPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(kernelResultArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;

      const failureDetail: KernelFailureDetail | undefined = !kernelResult.success
        ? (typeof kernelResult.error === "object" && kernelResult.error !== null
            ? (kernelResult.error as KernelFailureDetail)
            : {
                category: KernelFailureCategory.UNKNOWN,
                retryable: false,
                message: String(kernelResult.error ?? "Kernel execution failed"),
              })
        : undefined;

      let diagnosticsArtifactId: string | null = null;
      if (kernelResult.diagnostics) {
        const diagArtifact = buildArtifact(runUid, stepNumber, "DIAGNOSTICS", kernelResult.diagnostics, virtualMinute);
        pStart = Date.now();
        await this.artifactRepo.persist(diagArtifact, writeOpts);
        totalPersistDurationMs += Date.now() - pStart;
        totalArtifactsPersisted++;
        totalRepoWrites++;
        diagnosticsArtifactId = diagArtifact.artifactId;
      }

      let worldBeforeArtifactId: string | null = null;
      let worldAfterArtifactId: string | null = null;

      const worldBeforePayload = previousWorldSnapshot ?? {
        worldCaptureAttempted: false,
        worldCaptureSucceeded: false,
        reason: stepNumber === 1
          ? "Initial step - no previous world state exists"
          : "Previous step did not record a world snapshot",
      };
      const worldBeforeArtifact = buildArtifact(runUid, stepNumber, "WORLD_SNAPSHOT_BEFORE", worldBeforePayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(worldBeforeArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      worldBeforeArtifactId = worldBeforeArtifact.artifactId;

      const worldAfterPayload = kernelResult.worldSnapshot ?? {
        worldCaptureAttempted: true,
        worldCaptureSucceeded: false,
        reason: kernelResult.success
          ? "WorldModel produced no snapshot data"
          : "Kernel failed before WorldModel commit",
        kernelStatus: kernelResult.executionOutcome?.status ?? "FAILED",
        kernelFailureCategory: failureDetail?.category ?? KernelFailureCategory.UNKNOWN,
        kernelError: failureDetail?.message ?? String(kernelResult.error ?? "Kernel failed"),
      };
      const worldAfterArtifact = buildArtifact(runUid, stepNumber, "WORLD_SNAPSHOT_AFTER", worldAfterPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(worldAfterArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;
      worldAfterArtifactId = worldAfterArtifact.artifactId;

      const diffPayload = (previousWorldSnapshot && kernelResult.worldSnapshot)
        ? diffToPayload(computeDiff(previousWorldSnapshot, kernelResult.worldSnapshot))
        : {
            diffComputed: false,
            reason: !kernelResult.worldSnapshot
              ? "Diff cannot be computed because post-execution world snapshot failed"
              : "Diff cannot be computed because pre-execution world snapshot was missing",
            worldCaptureAttempted: true,
            worldCaptureSucceeded: Boolean(previousWorldSnapshot && kernelResult.worldSnapshot),
          };
      const diffArtifact = buildArtifact(runUid, stepNumber, "WORLD_SNAPSHOT_DIFF", diffPayload, virtualMinute);
      pStart = Date.now();
      await this.artifactRepo.persist(diffArtifact, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalArtifactsPersisted++;
      totalRepoWrites++;

      const stage8Notes = kernelResult.success
        ? "intent=" + kernelResult.intent
        : "[" + (failureDetail?.category ?? "FAILED") + "] " + (failureDetail?.message ?? String(kernelResult.error));

      traceBuilder.recordStage("KERNEL_INVOCATION", kernelResult.success ? "SUCCESS" : "FAILED", stageStart, {
        inputArtifactId: handleInputArtifact.artifactId,
        outputArtifactId: kernelResultArtifact.artifactId,
        notes: stage8Notes,
        failure: failureDetail,
      });

      // Stage 9: RUNTIME_ADVANCED
      stageStart = Date.now();
      traceBuilder.recordStage("RUNTIME_ADVANCED", "SUCCESS", stageStart, {
        notes: "tick " + snapshot.tick + " -> " + (snapshot.tick + 1),
      });

      // Stage 10: SNAPSHOT_PERSISTED
      const traceId = buildTraceId(runUid, stepNumber);
      stageStart = Date.now();
      const snapshotId = "SNAP_" + runUid + "_" + stepNumber;
      traceBuilder.recordStage("SNAPSHOT_PERSISTED", "SUCCESS", stageStart, {
        notes: "snapshotId=" + snapshotId,
      });

      const executionDurationMs = Date.now() - recordStartTime;
      const executionStatus: ExecutionStatus = kernelResult.success ? "SUCCESS" : "FAILED";
      const failureCategory = failureDetail?.category ?? null;
      const worldHash = SnapshotHasher.computeWorldHash(worldAfterPayload);
      const diffHash = SnapshotHasher.computeDiffHash(diffPayload);
      const previousSnapshotId = stepNumber > 1 ? `SNAP_${runUid}_${stepNumber - 1}` : null;

      const stepSnapshot = buildSnapshot({
        runUid,
        stepNumber,
        tick: snapshot.tick,
        virtualDay,
        virtualMinute,
        personaId: persona.id ?? persona.personaUid,
        personaCode: persona.code,
        decisionIntent: decision?.intent ?? "UNKNOWN",
        executionStatus,
        kernelSuccess: kernelResult.success,
        failureCategory,
        executionDurationMs,
        worldHash,
        diffHash,
        previousSnapshotId,
        traceId,
        promptArtifactId: promptArtifact.artifactId,
        llmResponseArtifactId: llmArtifact.artifactId,
        decisionArtifactId: decisionArtifact.artifactId,
        virtualRequestArtifactId: virtualRequestArtifact.artifactId,
        handleInputArtifactId: handleInputArtifact.artifactId,
        kernelResultArtifactId: kernelResultArtifact.artifactId,
        worldBeforeArtifactId,
        worldAfterArtifactId,
        diagnosticsArtifactId,
        metadata: {
          kernelVersion: snapshot.context.kernelVersion ?? "v2.4.0-deterministic",
          pipelineVersion: KERNEL_PIPELINE_VERSION,
          llmProvider: llmResponse?.provider ?? failureDetail?.provider ?? "unknown",
          llmModel: llmResponse?.model ?? failureDetail?.providerModel ?? "unknown",
        },
      });

      pStart = Date.now();
      await this.snapshotRepo.persist(stepSnapshot, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalRepoWrites++;
      console.log("[ExecutionRecorder] Snapshot persisted:", stepSnapshot.snapshotId);

      const transactionDurationMs = Date.now() - recordStartTime;
      traceBuilder.setRecorderMetrics({
        artifactCount: totalArtifactsPersisted,
        repositoryWrites: totalRepoWrites + 2,
        transactionDurationMs,
        persistDurationMs: totalPersistDurationMs,
        postHookDurationMs: 0,
      });

      const trace = traceBuilder.build(virtualMinute);
      pStart = Date.now();
      await this.traceRepo.persist(trace, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalRepoWrites++;
      console.log("[ExecutionRecorder] Trace persisted:", trace.traceId);

      const journalEntry = buildJournalEntry(stepSnapshot, trace.traceId);
      pStart = Date.now();
      await this.journalRepo.append(journalEntry, writeOpts);
      totalPersistDurationMs += Date.now() - pStart;
      totalRepoWrites++;
      console.log("[ExecutionRecorder] Journal appended:", journalEntry.journalEntryId);

      if (session) {
        await session.commitTransaction();
        session.endSession();
        session = null;
      }

      const hookStart = Date.now();
      for (const hook of this.postRecordHooks) {
        try {
          await hook(stepSnapshot);
        } catch (hookErr) {
          console.error("[ExecutionRecorder] post-record hook error:", hookErr);
        }
      }
      const postHookDurationMs = Date.now() - hookStart;
      if (trace.recorderMetrics) {
        trace.recorderMetrics.postHookDurationMs = postHookDurationMs;
      }

      return {
        snapshotId: stepSnapshot.snapshotId,
        traceId: trace.traceId,
        journalEntryId: journalEntry.journalEntryId,
      };
    } catch (err) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("[ExecutionRecorder] Error during record:", err);
      throw err;
    }
  }
}

