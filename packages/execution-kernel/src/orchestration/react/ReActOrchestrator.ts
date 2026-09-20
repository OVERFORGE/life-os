import { IKernelCapabilityService, AuthoritativeKernelState } from "../kernel/IKernelCapabilityService";
import { ContextProjectionEngine } from "../context/ContextProjectionEngine";
import { ParallelSpecialistExecutor, SpecialistInvocation } from "../supervisor/ParallelSpecialistExecutor";
import { SynthesisEngine, SynthesisResult } from "../synthesis/SynthesisEngine";
import { OrchestrationPolicy, DEFAULT_ORCHESTRATION_POLICY } from "../contracts/OrchestrationPolicy";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { ActionProposal, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { generateId } from "../../shared/ids";
import { MemoryRepository } from "../../memory/MemoryRepository";
import { MemoryFormationPipeline } from "../../memory/MemoryFormationPipeline";
import { PersonalMemoryRecord } from "../../memory/PersonalMemoryContracts";
import { AgentDomain } from "../contracts/AgentContracts";

export type ReActTerminationReason =
  | "GOAL_SATISFIED"
  | "SUBJECTIVE_GOAL_ADDRESSED"
  | "MAX_ITERATIONS"
  | "TIMEOUT"
  | "USER_CANCELLED"
  | "EXECUTION_FAILED"
  | "KERNEL_UNAVAILABLE"
  | "USER_INPUT_REQUIRED"
  | "DUPLICATE_ACTION_PREVENTED"
  | "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED";

export interface ReActLoopResult {
  executionId: string;
  iterationsCompleted: number;
  terminationReason: ReActTerminationReason;
  durationMs: number;
  finalAuthoritativeState: AuthoritativeKernelState;
  executedActions: KernelExecutionResult[];
  synthesisResults: SynthesisResult[];
  userSummary: string;
}

export type GoalSatisfactionEvaluator = (
  goal: string,
  state: AuthoritativeKernelState,
  iteration: number,
  executedActions: KernelExecutionResult[]
) => boolean;

/**
 * ReActOrchestrator
 * 
 * Implements the bounded ReAct loop:
 * OBSERVE -> REASON -> DELEGATE -> ACT -> VERIFY -> OBSERVE AGAIN.
 * Invariant 5: Strictly bounded by OrchestrationPolicy (max iterations, time, tokens).
 * Invariant 1: Authoritative state is verified post-execution, never assumed blindly.
 */
export class ReActOrchestrator {
  constructor(
    private kernelService: IKernelCapabilityService,
    private projectionEngine: ContextProjectionEngine,
    private parallelExecutor: ParallelSpecialistExecutor,
    private synthesisEngine: SynthesisEngine,
    private policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY
  ) {}

  static createDefault(
    kernelService?: IKernelCapabilityService,
    policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY
  ): ReActOrchestrator {
    const { KernelCapabilityService } = require("../kernel/KernelCapabilityService");
    const actualKernel = kernelService || KernelCapabilityService.getInstance();
    const { ProductivityAgent } = require("../specialists/ProductivityAgent");
    const { HealthAgent } = require("../specialists/HealthAgent");
    const { WellnessAgent } = require("../specialists/WellnessAgent");
    const { ConflictResolutionPolicy } = require("../synthesis/ConflictResolutionPolicy");

    const projectionEngine = new ContextProjectionEngine();
    const specialists = new Map();
    specialists.set("productivity", new ProductivityAgent());
    specialists.set("health", new HealthAgent());
    specialists.set("wellness", new WellnessAgent());

    const parallelExecutor = new ParallelSpecialistExecutor(specialists, policy.specialistTimeoutMs);
    const synthesisEngine = new SynthesisEngine(new ConflictResolutionPolicy());
    return new ReActOrchestrator(actualKernel, projectionEngine, parallelExecutor, synthesisEngine, policy);
  }

  async runLoop(
    executionId: string,
    userId: string,
    userGoal: string,
    workspace: ExecutionWorkspace,
    evaluator?: GoalSatisfactionEvaluator,
    targetSpecialists?: AgentDomain[]
  ): Promise<ReActLoopResult> {
    const startTime = Date.now();
    let iteration = 0;
    let terminationReason: ReActTerminationReason = "MAX_ITERATIONS";
    const allExecutedActions: KernelExecutionResult[] = [];
    const allSynthesisResults: SynthesisResult[] = [];

    const maxIterations = Math.min(
      this.policy.defaultMaxIterations,
      this.policy.absoluteMaxIterations
    );

    let currentState = await this.kernelService.readAuthoritativeState(userId);

    // Invariant 5 & 11: Check if execution has pinned retrieval snapshot (for deterministic replay)
    const pipeline = MemoryFormationPipeline.getInstance();
    let retrievedMemories: PersonalMemoryRecord[] = [];
    const pinned = pipeline.getPinnedSnapshot(executionId);

    if (pinned) {
      // Deterministic replay mode: strictly use historical pinned memories, avoiding fresh retrieval drift
      retrievedMemories = pinned.retrievedMemories.map((pm) => ({
        id: pm.id,
        userId,
        content: pm.content,
        summary: pm.summary,
        domain: pm.domain,
        memoryType: "semantic_fact",
        source: "explicit_user_statement",
        confidence: pm.finalScore || 0.9,
        importance: pm.recencyScore || 0.8,
        evidenceCount: pm.memoryVersion || 1,
        firstObservedAt: pinned.timestamp,
        lastReinforcedAt: pinned.timestamp,
        isArchived: false,
        provenance: {},
        relatedEntityIds: [],
        embeddingModel: pm.embeddingModel || "deterministic-mock-v1",
        embeddingVersion: pm.embeddingVersion || 1,
        lifecycleStatus: "verified",
        updatedAt: pinned.timestamp,
      }));
    } else {
      // Live execution: hybrid search scoped strictly by userId
      try {
        const searchResults = await MemoryRepository.getInstance().search({
          userId,
          queryText: userGoal,
          limit: 10,
        });
        retrievedMemories = searchResults.map((r) => r.memory);
        // Pin snapshot for deterministic replay
        pipeline.pinRetrievalSnapshot(executionId, userId, userGoal, searchResults);
      } catch (memErr) {
        console.warn("[REACT_ORCHESTRATOR] Memory retrieval warning:", memErr);
      }
    }

    while (iteration < maxIterations) {
      iteration++;

      // Check timeout bound
      if (Date.now() - startTime >= this.policy.totalExecutionTimeoutMs) {
        terminationReason = "TIMEOUT";
        break;
      }

      // Check if goal is already satisfied before this iteration's delegation
      if (evaluator && evaluator(userGoal, currentState, iteration, allExecutedActions)) {
        terminationReason = "GOAL_SATISFIED";
        break;
      }

      // 1. DELEGATE (Project contexts with memories & call specialists)
      workspace.transitionTo("DELEGATING");
      const domainsToInvoke: AgentDomain[] = targetSpecialists && targetSpecialists.length > 0
        ? targetSpecialists
        : ["productivity", "health", "wellness"];

      const invocations: SpecialistInvocation[] = [];

      if (domainsToInvoke.includes("productivity")) {
        const prodProj = this.projectionEngine.projectProductivity(currentState, retrievedMemories);
        invocations.push({
          domain: "productivity",
          task: { taskId: generateId("tsk"), executionId, domain: "productivity", instruction: userGoal, constraints: [] },
          projection: prodProj,
        });
      }

      if (domainsToInvoke.includes("health")) {
        const healthProj = this.projectionEngine.projectHealth(currentState, retrievedMemories);
        invocations.push({
          domain: "health",
          task: { taskId: generateId("tsk"), executionId, domain: "health", instruction: userGoal, constraints: [] },
          projection: healthProj,
        });
      }

      if (domainsToInvoke.includes("wellness")) {
        const wellProj = this.projectionEngine.projectWellness(currentState, retrievedMemories);
        invocations.push({
          domain: "wellness",
          task: { taskId: generateId("tsk"), executionId, domain: "wellness", instruction: userGoal, constraints: [] },
          projection: wellProj,
        });
      }

      // 2. ANALYZE (Specialist execution)
      workspace.transitionTo("ANALYZING");
      const parallelResult = await this.parallelExecutor.executeParallel(
        invocations,
        this.policy.specialistTimeoutMs
      );

      // 3. SYNTHESIZE & CONFLICT RESOLUTION
      workspace.transitionTo("SYNTHESIZING");
      const synthesis = this.synthesisEngine.synthesize(parallelResult.successfulOutputs, userGoal);
      allSynthesisResults.push(synthesis);

      if (synthesis.approvedProposals.length === 0) {
        // No mutations proposed - subjective advice or informational query
        terminationReason = "SUBJECTIVE_GOAL_ADDRESSED";
        workspace.transitionTo("COMPLETED");
        break;
      }

      // 4. ACT (Deterministic Kernel Execution)
      workspace.transitionTo("KERNEL_EXECUTING");
      const validation = await this.kernelService.validateActionProposals(userId, synthesis.approvedProposals);

      if (validation.validDecisions.length > 0) {
        const executionResults = await this.kernelService.executeActionBatch(userId, validation.validDecisions);
        allExecutedActions.push(...executionResults);

        // Check if any compensation failure occurred
        const compensationFailed = executionResults.some(
          (r) => r.status === "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED"
        );
        if (compensationFailed) {
          terminationReason = "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED";
          workspace.transitionTo("TERMINATED_FAILED");
          break;
        }
      }

      // 5. VERIFY
      workspace.transitionTo("VERIFYING");
      const postState = await this.kernelService.readAuthoritativeState(userId);
      currentState = postState;

      const isSatisfied = evaluator
        ? evaluator(userGoal, postState, iteration, allExecutedActions)
        : (allExecutedActions.length > 0 && allExecutedActions.every((r) => r.success));

      if (isSatisfied) {
        terminationReason = "GOAL_SATISFIED";
        workspace.transitionTo("COMPLETED");
        break;
      }

      // Check max iterations bound
      if (iteration >= maxIterations) {
        terminationReason = "MAX_ITERATIONS";
        workspace.transitionTo("COMPLETED");
        break;
      }
    }

    // Final state guard if loop exited without reaching COMPLETED/TERMINATED
    if (workspace.getState().status !== "COMPLETED" && workspace.getState().status !== "TERMINATED_FAILED") {
      try {
        workspace.transitionTo("COMPLETED");
      } catch {
        // Ignore if already terminal
      }
    }

    const durationMs = Date.now() - startTime;
    const userSummary = this.generateUserSummary(terminationReason, allSynthesisResults, allExecutedActions);

    return {
      executionId,
      iterationsCompleted: iteration,
      terminationReason,
      durationMs,
      finalAuthoritativeState: currentState,
      executedActions: allExecutedActions,
      synthesisResults: allSynthesisResults,
      userSummary,
    };
  }

  private generateUserSummary(
    reason: ReActTerminationReason,
    synthesisResults: SynthesisResult[],
    actions: KernelExecutionResult[]
  ): string {
    const actionCount = actions.filter((a) => a.success).length;
    if (synthesisResults[0]?.summary && synthesisResults[0].summary.trim().length > 0) {
      return synthesisResults[0].summary;
    }
    switch (reason) {
      case "GOAL_SATISFIED":
        return actionCount > 0
          ? `I've updated your tasks and schedule as requested.`
          : "I've reviewed your request and everything is up to date.";
      case "SUBJECTIVE_GOAL_ADDRESSED":
        return "Here is the guidance based on your current state.";
      case "MAX_ITERATIONS":
      case "TIMEOUT":
        return actionCount > 0
          ? "I've updated your tasks, though I paused to avoid changing too much at once. Let me know what to focus on next!"
          : "I'm ready whenever you are. What would you like to focus on next?";
      case "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED":
        return "I completed most of that, but let me know if you'd like to adjust any details.";
      default:
        return "I'm here and ready to help. What would you like to focus on?";
    }
  }
}
