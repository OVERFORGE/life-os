import * as path from "node:path";
import mongoose from "mongoose";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DynamicRouter, RoutingDecision } from "../supervisor/DynamicRouter";
import { evaluateOperationalRouting, RoutingEvaluationResult } from "../supervisor/OperationalRoutingGate";
import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import { ReActOrchestrator, ReActLoopResult } from "../react/ReActOrchestrator";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { ProductionTracer } from "../observability/ProductionTracer";
import { generateId } from "../../shared/ids";
import { cleanLLMResponse, createAbortError, isAbortError } from "../../shared/groq";
import { invokeLifeOSChat, streamLifeOSChat } from "../../shared/langchain/LifeOSChatModel";
import { resolveGroqModel } from "../../shared/modelRegistry";
import { ConversationManager } from "../../kernel/ConversationManager";
import { buildSupervisorPersonaPrompt, AVEN_IDENTITY, extractFirstName } from "../../persona";
import { SemanticIntentInterpreter } from "../semantic/SemanticIntentInterpreter";
import { FastSemanticFiller } from "../semantic/FastSemanticFiller";
import { ActionProposal, DOMAIN_CAPABILITIES, DomainActionType } from "../contracts/ActionProposalContracts";
import { KernelCapabilityService } from "../kernel/KernelCapabilityService";
import {
  IContextEntityRef,
  IExecutedOperationSnapshot,
  IPendingOperationContext,
  SemanticOperation,
  SemanticTurn,
} from "../contracts/SemanticTurnContracts";
import { CapabilityPresentationRegistry } from "../external/presentation/CapabilityPresentationRegistry";
import { WorldModelBridge } from "../../worldv2/WorldModelBridge";
import { ContextProjectionSerializer } from "../../worldv2/ContextProjectionSerializer";
import { IterativeActionDispatcher } from "../kernel/IterativeActionDispatcher";
import { DynamicWorkflowPlanner } from "../planning/DynamicWorkflowPlanner";
import { StepDataResolver } from "../workspace/StepDataResolver";
import { ExecutionPersistenceService } from "../workspace/ExecutionPersistenceService";
import { buildLangGraphThreadConfig } from "./adapters/KernelCapabilityToolBridge";
import {
  ActiveTraceContext,
  createTraceContext,
  getActiveTraceContext,
  recordTraceStep,
  runWithTraceContext,
} from "../observability/TraceContext";
import { LifeOSTraceCallbackHandler } from "../observability/LifeOSTraceCallbackHandler";
import {
  buildLangSmithRunUrl,
  isLangSmithEnabled,
  syncLangSmithEnv,
} from "../observability/LangSmithBridge";
import { TracePersistenceService } from "../observability/TracePersistenceService";
import type { SupervisorRequest, SupervisorResponse, IProviderConnectionChecker } from "../supervisor/Supervisor";

export type OrchestrationRouteTarget =
  | "fast_atomic"
  | "unregistered_capability"
  | "dynamic_workflow"
  | "cancel_or_dismiss"
  | "clarification"
  | "semantic_operations"
  | "conversational_llm"
  | "react_specialists";

export const ConversationGraphState = Annotation.Root({
  executionId: Annotation<string>(),
  requestId: Annotation<string>(),
  userId: Annotation<string>(),
  userName: Annotation<string | undefined>(),
  conversationId: Annotation<string>(),
  message: Annotation<string>(),
  timezone: Annotation<string | undefined>(),
  referenceTimeMs: Annotation<number | undefined>(),
  streamMode: Annotation<"events" | "raw" | undefined>(),
  startTime: Annotation<number>(),
  routeTarget: Annotation<OrchestrationRouteTarget | undefined>(),
  loadedState: Annotation<any>(),
  stm: Annotation<any>(),
  pendingOp: Annotation<IPendingOperationContext | null>(),
  lifeContext: Annotation<any>(),
  tailoredContext: Annotation<any>(),
  semanticTurn: Annotation<SemanticTurn | undefined>(),
  routingEval: Annotation<RoutingEvaluationResult | undefined>(),
  routingDecision: Annotation<RoutingDecision | undefined>(),
  responsePayload: Annotation<SupervisorResponse | undefined>(),
});

export type ConversationGraphStateType = typeof ConversationGraphState.State;

interface TurnRuntimeContext {
  req: SupervisorRequest;
  router: DynamicRouter;
  kernel?: any;
  reactOrchestrator?: ReActOrchestrator;
  connectionChecker?: IProviderConnectionChecker;
  isEventsMode: boolean;
  earlyFillerEmitted: boolean;
  mainExecutionFinished: boolean;
  fillerSettled: boolean;
  fillerPromise: Promise<string | null>;
}

/**
 * LifeOSOrchestrationGraph
 *
 * Single authoritative compiled LangGraph StateGraph for all live LifeOS conversation turns.
 * Owns AI turn control flow, routing transitions, and LangChain model/tool invocation while
 * keeping KernelCapabilityService, durable Mongo STM/workspaces, HMAC HITL approval, and Outbox
 * strictly authoritative for side effects and state truth.
 */
export class LifeOSOrchestrationGraph {
  private static instance: LifeOSOrchestrationGraph;
  private compiledGraph: ReturnType<LifeOSOrchestrationGraph["buildGraph"]>["compile"] extends (
    ...args: any[]
  ) => infer R
    ? R
    : any;
  private runtimeContexts = new Map<string, TurnRuntimeContext>();

  constructor() {
    this.compiledGraph = this.buildGraph().compile();
  }

  static getInstance(): LifeOSOrchestrationGraph {
    if (!LifeOSOrchestrationGraph.instance) {
      LifeOSOrchestrationGraph.instance = new LifeOSOrchestrationGraph();
    }
    return LifeOSOrchestrationGraph.instance;
  }

  private getRuntime(executionId: string): TurnRuntimeContext {
    const rt = this.runtimeContexts.get(executionId);
    if (!rt) {
      throw new Error(`[LifeOSOrchestrationGraph] Missing runtime context for executionId=${executionId}`);
    }
    return rt;
  }

  private emitText(req: SupervisorRequest, text: string): void {
    if (!text) return;
    req.onChunk?.(text);
    req.onEvent?.({ type: "assistant_delta", text });
  }

  private deterministicPick(candidates: string[], seed: string): string {
    if (candidates.length === 0) return "";
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return candidates[hash % candidates.length];
  }

  private async executeFastAtomicProposal(
    rt: TurnRuntimeContext,
    proposal: ActionProposal,
    userId: string
  ): Promise<{ handled: boolean; proposal: ActionProposal; kernelResults: any[]; userResponse: string }> {
    const kernelService = rt.kernel || KernelCapabilityService.getInstance();
    const validation = await kernelService.validateActionProposals(userId, [proposal]);
    if (!validation.valid || validation.validDecisions.length === 0) {
      const reason = validation.rejectedProposals[0]?.reason || "Validation rejected";
      return {
        handled: true,
        proposal,
        kernelResults: [],
        userResponse: `I couldn't complete that request: ${reason}`,
      };
    }
    const results = await kernelService.executeActionBatch(userId, validation.validDecisions);
    let userResponse = "Completed request successfully.";
    const act = String(proposal.actionType).toLowerCase();
    if (act === "create_task") {
      userResponse = `Created task: ${proposal.payload?.title || "new task"}.`;
    } else if (act === "complete_task") {
      userResponse = "Marked task as completed.";
    } else if (act === "delete_task") {
      userResponse = "Deleted task.";
    } else if (act === "log_signal") {
      userResponse = `Logged ${proposal.payload?.signalKey || "signal"}.`;
    } else {
      userResponse = `Action ${proposal.actionType} completed successfully.`;
    }
    return {
      handled: true,
      proposal,
      kernelResults: results,
      userResponse,
    };
  }

  private async findMissingProviderInfo(
    rt: TurnRuntimeContext,
    userId: string,
    operations: SemanticOperation[]
  ): Promise<{ providerId: string; providerDisplayName: string; capabilityURN: string; status?: string } | null> {
    for (const op of operations) {
      let reqProviderId: string | undefined = op.providerHint || (op.payload?.providerId as string | undefined);
      let capURN: string = op.capabilityURN || "";

      if (op.actionType === "external_capability_action") {
        reqProviderId = op.payload?.providerId || op.providerHint;
        capURN = op.payload?.capabilityURN || op.capabilityURN || "";
      } else if (op.capabilityURN) {
        if (op.capabilityURN.startsWith("productivity.calendar")) reqProviderId = "google_calendar";
        else if (op.capabilityURN.startsWith("wellness.media")) reqProviderId = "spotify";
        else if (op.capabilityURN.startsWith("productivity.git")) reqProviderId = "github";
        else if (op.capabilityURN.startsWith("productivity.email")) reqProviderId = "gmail";
        else if (op.capabilityURN.startsWith("productivity.contacts")) reqProviderId = "google_contacts";
        else if (op.capabilityURN.startsWith("productivity.task")) reqProviderId = "google_tasks";
        else if (op.capabilityURN.startsWith("health.")) reqProviderId = "google_fit";
      }

      if (reqProviderId && rt.connectionChecker) {
        const check = await rt.connectionChecker.checkConnection(userId, reqProviderId);
        if (!check.connected && check.status !== "NOT_REQUIRED") {
          return {
            providerId: reqProviderId,
            providerDisplayName: check.providerDisplayName || reqProviderId,
            capabilityURN: capURN || `productivity.${reqProviderId}`,
            status: check.status,
          };
        }
      }
    }
    return null;
  }

  private async handleMissingProviderResponse(params: {
    rt: TurnRuntimeContext;
    req: SupervisorRequest;
    conversationId: string;
    missingProviderInfo: { providerId: string; providerDisplayName: string; capabilityURN: string; status?: string };
    executionId: string;
    requestId: string;
    routingDecision: RoutingDecision;
    startTime: number;
    lifeContext: any;
    semanticTurn: SemanticTurn;
  }): Promise<SupervisorResponse> {
    const {
      rt,
      req,
      conversationId,
      missingProviderInfo,
      executionId,
      requestId,
      routingDecision,
      startTime,
      lifeContext,
      semanticTurn,
    } = params;
    const pName = missingProviderInfo.providerDisplayName;
    const isDbOffline = missingProviderInfo.status === "PERSISTENCE_UNAVAILABLE";
    const connectMsg = isDbOffline
      ? `Database service is temporarily unavailable. Cannot verify authorization for ${pName}. Action aborted.`
      : missingProviderInfo.providerId === "spotify"
        ? `I can do that once ${pName} is connected.`
        : `I can handle that, but ${pName} isn't connected yet.`;

    req.onEvent?.({
      type: "missing_connection",
      providerId: missingProviderInfo.providerId,
      providerDisplayName: pName,
      capabilityURN: missingProviderInfo.capabilityURN,
      message: connectMsg,
      connectUrl: isDbOffline ? "" : "/settings/connections",
    });

    if (isDbOffline) {
      req.onChunk?.(connectMsg);
      req.onEvent?.({ type: "assistant_delta", text: connectMsg });
      return {
        executionId,
        requestId,
        routingDecision,
        response: connectMsg,
        durationMs: Date.now() - startTime,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "PERSISTENCE_UNAVAILABLE",
        lifeContext,
      };
    }

    const op = semanticTurn.operations[0];
    const newPendingOp: IPendingOperationContext = {
      operationId: op?.operationId || generateId("pop"),
      turnId: semanticTurn.turnId,
      actionType: op?.actionType || "external_capability_action",
      domain: op?.domain || "productivity",
      partialPayload: op?.payload || { providerId: missingProviderInfo.providerId },
      missingRequirement: {
        kind: "PARAMETER_VALUE",
        targetEntityType: "task",
        parameterName: "provider_connection",
      },
      clarificationQuestion: connectMsg,
      state: "AWAITING_CLARIFICATION",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    const stmUpdates = { pendingOperation: newPendingOp };
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
        await ConversationShortTermMemory.updateOne(
          { conversationId, userId: req.userId },
          { $set: stmUpdates },
          { upsert: true }
        );
      }
    } catch (_) {}

    rt.mainExecutionFinished = true;
    req.onChunk?.(connectMsg);
    req.onEvent?.({ type: "assistant_delta", text: connectMsg });

    const traceContext = ProductionTracer.getInstance().recordTrace({
      requestId,
      executionId,
      userId: req.userId,
      actionIds: [],
      eventIds: [],
      durationMs: Date.now() - startTime,
      routingStrategy: routingDecision.strategy,
      terminationReason: "MISSING_PROVIDER_CONNECTION",
      timestamp: Date.now(),
    });

    return {
      executionId,
      requestId,
      routingDecision,
      response: connectMsg,
      durationMs: Date.now() - startTime,
      actionsExecuted: 0,
      workspaceStatus: "COMPLETED",
      terminationReason: "MISSING_PROVIDER_CONNECTION",
      traceContext,
      stmUpdates,
      pendingOperation: newPendingOp,
      lifeContext,
      semanticTurnMeta: {
        primaryClassification: semanticTurn.primaryClassification,
        operationsCount: semanticTurn.operations.length,
        hasOperations: semanticTurn.operations.length > 0,
      },
    };
  }

  private getSemanticFiller(semanticTurn: SemanticTurn): string | null {
    if (semanticTurn.primaryClassification === "CASUAL_DIALOGUE") return null;
    if (semanticTurn.primaryClassification === "INFORMATION_QUERY") {
      return this.deterministicPick(
        [
          "One moment, checking that for you.",
          "Let me look that up for you.",
          "Pulling up your schedule now.",
          "Checking your agenda now, one moment.",
          "Looking into that for you now.",
          "Reviewing your records now.",
        ],
        semanticTurn.turnId || "query"
      );
    }
    if (semanticTurn.operations.length === 0) return null;
    const firstOp = semanticTurn.operations[0];
    const actionType = firstOp?.actionType;
    const domain = firstOp?.domain;
    const FILLERS: Record<string, string[]> = {
      create_task: ["Right away, let me schedule that for you.", "On it, adding that to your schedule."],
      complete_task: ["On it, marking that complete for you.", "Right away, checking that off for you."],
      adjust_task_priority: ["Understood, updating that priority now."],
      delete_task: ["Understood, removing that task for you."],
      reschedule_task: ["One moment, rescheduling that for you."],
      propose_goal: ["Understood, structuring that habit for you now."],
      confirm_goal: ["Understood, activating that goal for you now."],
      log_meal: ["Got it, logging your meal now."],
      log_workout: ["Understood, recording your workout session now."],
      record_mental_estimate: ["Understood, logging your energy and recovery state."],
      set_context_mode: ["Understood, switching your context mode now."],
    };
    const candidates =
      (actionType && FILLERS[actionType]) ||
      (domain === "productivity"
        ? ["Understood, taking care of that for you now."]
        : domain === "health"
          ? ["Checking your health context and logging that now."]
          : domain === "wellness"
            ? ["Reviewing your wellness context and recording that now."]
            : ["Understood, processing that for you now."]);
    return this.deterministicPick(candidates, semanticTurn.turnId || "filler");
  }

  private getExecutiveAcknowledgement(message: string, decision: RoutingDecision): string {
    const domain =
      decision.targetDomain ||
      (decision.selectedSpecialists && decision.selectedSpecialists[0]) ||
      "productivity";
    if (domain === "productivity") {
      return this.deterministicPick(
        ["Understood. Structuring that plan now.", "Putting that structure together now."],
        message
      );
    }
    if (domain === "health") {
      return this.deterministicPick(
        ["Checking your health and recovery metrics now.", "Reviewing your training context now."],
        message
      );
    }
    if (domain === "wellness") {
      return this.deterministicPick(
        ["Understood. Let's look at your workload and recovery.", "Reviewing your recovery balance now."],
        message
      );
    }
    return this.deterministicPick(["Understood. Looking into that for you now."], message);
  }

  private buildGraph() {
    const workflow = new StateGraph(ConversationGraphState)
      .addNode("prepare_context", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        if (req.abortSignal?.aborted) {
          throw createAbortError();
        }

        let loadedState: any = null;
        try {
          loadedState = await ConversationManager.getInstance().load(state.conversationId, req.userId);
        } catch (_) {}

        const stm = loadedState?.stm || null;
        let pendingOp: IPendingOperationContext | null = stm?.pendingOperation || null;
        let pendingOpExpired = false;
        if (pendingOp && pendingOp.expiresAt) {
          if (Date.now() > new Date(pendingOp.expiresAt).getTime()) {
            pendingOp.state = "EXPIRED";
            pendingOp = null;
            pendingOpExpired = true;
          }
        }

        if (pendingOpExpired) {
          try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
              await ConversationShortTermMemory.updateOne(
                { conversationId: state.conversationId, userId: req.userId },
                { $set: { pendingOperation: null } },
                { upsert: true }
              );
            }
          } catch (_) {}
        }

        const bridge = WorldModelBridge.getInstance();
        const lifeContext = await bridge.getProjection(req.userId, { timezone: req.timezone });
        recordTraceStep({
          layer: "context",
          component: "WorldModelBridge",
          operation: "getProjection",
          status: "COMPLETED",
          startedAtMs: state.startTime,
          durationMs: Math.max(0, Date.now() - state.startTime),
          inputs: { timezone: req.timezone || "UTC", hasPendingOp: Boolean(pendingOp) },
          outputs: {
            hasSummary: Boolean(lifeContext?.systemPromptContextSummary),
            pendingOpExpired,
          },
        });

        return {
          loadedState,
          stm,
          pendingOp,
          lifeContext,
        };
      })

      .addNode("interpret_intent", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        if (req.abortSignal?.aborted) {
          throw createAbortError();
        }

        const effectiveActiveFocus =
          req.activeFocus !== undefined ? req.activeFocus : state.stm?.activeFocus || null;
        const semanticTurn = await SemanticIntentInterpreter.getInstance().interpret(req.message, {
          userId: req.userId,
          userName: req.userName,
          conversationId: state.conversationId,
          timezone: req.timezone,
          referenceTimeMs: req.referenceTimeMs,
          knownTasks: req.knownTasks,
          recentHistory: (state.loadedState?.recentMessages || []).slice(-16),
          activeFocus: effectiveActiveFocus,
          recentEntities: state.stm?.recentEntities || [],
          pendingOperation: state.pendingOp,
          activeMode: state.stm?.activeContextMode || "standard",
          activeIncidents: state.stm?.activeIncidents || [],
          serializedLifeContext: state.lifeContext?.systemPromptContextSummary,
          lifeContextProjection: state.lifeContext,
        });

        const hasAnaphoricReferent =
          Boolean(effectiveActiveFocus) ||
          Boolean(state.stm?.recentEntities?.length) ||
          Boolean(state.pendingOp);
        if (
          !hasAnaphoricReferent &&
          semanticTurn.operations.some((op) => op.targetReference?.kind === "CONTEXTUAL_ANAPHORIC")
        ) {
          semanticTurn.ambiguityStatus = "ENTITY_AMBIGUOUS";
          semanticTurn.clarification = {
            required: true,
            reason: "AMBIGUOUS_REFERENCE",
            questionToUser:
              semanticTurn.clarification?.questionToUser || "Which item would you like me to act on?",
          };
        }

        const contextTarget =
          semanticTurn.relevanceDomains && semanticTurn.relevanceDomains.length > 0
            ? semanticTurn.relevanceDomains
            : "GENERAL";
        const tailoredContext = ContextProjectionSerializer.selectContext(
          state.lifeContext,
          contextTarget,
          1400
        );

        return {
          semanticTurn,
          tailoredContext,
        };
      })

      .addNode("route_turn", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const semanticTurn = state.semanticTurn!;
        const routingEval = evaluateOperationalRouting(semanticTurn);
        const routingDecision = rt.router.route(state.message, semanticTurn);

        let routeTarget: OrchestrationRouteTarget = "react_specialists";

        if (
          routingEval.eligibleForImmediateExecution &&
          routingEval.category === "SINGLE_ATOMIC_OPERATION" &&
          routingEval.proposals?.[0] &&
          !routingEval.hasReadOperations
        ) {
          routeTarget = "fast_atomic";
        } else if (routingEval.category === "UNREGISTERED_CAPABILITY") {
          routeTarget = "unregistered_capability";
        } else {
          const isMultiStepGoal =
            routingDecision.strategy === "DYNAMIC_WORKFLOW" ||
            routingEval.category === "COMPOSITE_WORKFLOW_DAG";
          if (
            isMultiStepGoal &&
            semanticTurn.primaryClassification !== "CANCEL_OR_DISMISS" &&
            semanticTurn.primaryClassification !== "CONFIRMATION" &&
            !state.pendingOp
          ) {
            routeTarget = "dynamic_workflow";
          } else if (semanticTurn.primaryClassification === "CANCEL_OR_DISMISS") {
            routeTarget = "cancel_or_dismiss";
          } else if (
            semanticTurn.clarification?.required &&
            semanticTurn.clarification.questionToUser
          ) {
            routeTarget = "clarification";
          } else if (semanticTurn.operations.length > 0) {
            routeTarget = "semantic_operations";
          } else if (routingDecision.strategy === "CONVERSATIONAL_LLM") {
            routeTarget = "conversational_llm";
          } else {
            routeTarget = "react_specialists";
          }
        }

        recordTraceStep({
          layer: "routing",
          component: "DynamicRouter",
          operation: "route_turn",
          status: "COMPLETED",
          startedAtMs: Date.now(),
          durationMs: 0,
          inputs: {
            primaryClassification: semanticTurn.primaryClassification,
            ambiguityStatus: semanticTurn.ambiguityStatus,
            operationsCount: semanticTurn.operations.length,
          },
          decision: {
            routeTarget,
            routingCategory: routingEval.category,
            strategy: routingDecision.strategy,
            rationale: routingDecision.rationale,
          },
        });

        return {
          routingEval,
          routingDecision,
          routeTarget,
        };
      })

      .addNode("execute_fast_atomic", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const proposal = state.routingEval!.proposals![0];

        if (proposal.actionType === "external_capability_action") {
          const missingFastProvider = await this.findMissingProviderInfo(
            rt,
            req.userId,
            state.semanticTurn!.operations
          );
          if (missingFastProvider) {
            rt.mainExecutionFinished = true;
            const resp = await this.handleMissingProviderResponse({
              rt,
              req,
              conversationId: state.conversationId,
              missingProviderInfo: missingFastProvider,
              executionId: state.executionId,
              requestId: state.requestId,
              routingDecision: {
                strategy: "FAST_PATH",
                confidence: 1.0,
                rationale: "External capability requires verified provider connection",
              },
              startTime: state.startTime,
              lifeContext: state.lifeContext,
              semanticTurn: state.semanticTurn!,
            });
            return { responsePayload: resp };
          }
        }

        const fastResult = await this.executeFastAtomicProposal(rt, proposal, req.userId);
        if (fastResult.handled) {
          const durationMs = Date.now() - state.startTime;
          const actionsExecuted = fastResult.kernelResults?.filter((r) => r.success).length || 0;
          const actionIds = fastResult.kernelResults?.map((r) => r.actionId) || [];
          const fastDecision: RoutingDecision = {
            strategy: "FAST_PATH",
            confidence: 1.0,
            rationale: "Deterministic atomic mutation meeting fast execution criteria",
          };

          const traceContext = ProductionTracer.getInstance().recordTrace({
            requestId: state.requestId,
            executionId: state.executionId,
            userId: req.userId,
            actionIds,
            eventIds: [],
            durationMs,
            routingStrategy: "FAST_PATH",
            terminationReason: "GOAL_SATISFIED",
            timestamp: Date.now(),
          });

          rt.mainExecutionFinished = true;
          rt.fillerSettled = true;
          this.emitText(req, fastResult.userResponse);
          const bridge = WorldModelBridge.getInstance();
          if (actionsExecuted > 0) {
            bridge.invalidate(req.userId);
          }
          const fastLifeContext = await bridge.getProjection(req.userId, { timezone: req.timezone });

          return {
            responsePayload: {
              executionId: state.executionId,
              requestId: state.requestId,
              routingDecision: fastDecision,
              response: fastResult.userResponse,
              durationMs,
              actionsExecuted,
              workspaceStatus: "COMPLETED",
              terminationReason: "GOAL_SATISFIED",
              traceContext,
              lifeContext: fastLifeContext,
            },
          };
        }

        return {};
      })

      .addNode("execute_unregistered", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const response =
          state.routingEval?.userExplanation ||
          "The requested action cannot be executed because the required capability is not registered.";
        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;
        this.emitText(req, response);
        const routingDecision: RoutingDecision = {
          strategy: "CONVERSATIONAL_LLM",
          confidence: 1.0,
          rationale: "Unregistered capability failed closed",
        };
        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds: [],
          eventIds: [],
          durationMs: Date.now() - state.startTime,
          routingStrategy: routingDecision.strategy,
          terminationReason: "UNREGISTERED_CAPABILITY",
          timestamp: Date.now(),
        });
        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response,
            durationMs: Date.now() - state.startTime,
            actionsExecuted: 0,
            workspaceStatus: "FAILED",
            terminationReason: "UNREGISTERED_CAPABILITY",
            traceContext,
            lifeContext: state.lifeContext,
          },
        };
      })

      .addNode("execute_dynamic_workflow", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const semanticTurn = state.semanticTurn!;
        const routingDecision = state.routingDecision!;
        const dispatcher = IterativeActionDispatcher.getInstance(rt.kernel);

        const tz = req.timezone || "UTC";
        const refDate = req.referenceTimeMs ? new Date(req.referenceTimeMs) : new Date();
        let localDate = refDate.toISOString().slice(0, 10);
        let dayOfWeek = "Today";
        try {
          localDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(refDate);
          dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(refDate);
        } catch (_) {}
        const temporalContext = { localDate, dayOfWeek, timezone: tz };

        let plan: any = null;
        req.onEvent?.({ type: "status", status: "planning", message: "Planning next steps..." });
        try {
          const planner = new DynamicWorkflowPlanner({
            llmClient: {
              complete: async (prompt: string, signal?: AbortSignal) =>
                invokeLifeOSChat({
                  messages: [{ role: "user", content: prompt }],
                  model: resolveGroqModel(),
                  temperature: 0.1,
                  maxTokens: 1500,
                  signal: signal || req.abortSignal,
                }),
            },
            allowBenchmarkFallback: process.env.NODE_ENV === "test",
          });
          plan = await planner.planWorkflow({
            userRequest: req.message,
            goal: req.message,
            signal: req.abortSignal,
            context: {
              temporalContext,
              timezone: tz,
              referenceTimeMs: req.referenceTimeMs,
              lifeContext: state.lifeContext,
              tailoredContext: state.tailoredContext?.serializedContext,
            },
          });
        } catch (planErr: any) {
          if (isAbortError(planErr) || req.abortSignal?.aborted) {
            throw createAbortError();
          }
        }

        if (req.abortSignal?.aborted) {
          throw createAbortError();
        }

        const wfResult: any =
          plan && plan.steps && plan.steps.length > 0
            ? await dispatcher.executeGraphWorkflow({
                userId: req.userId,
                userName: req.userName,
                userRequest: req.message,
                goal: req.message,
                conversationId: state.conversationId,
                executionId: state.executionId,
                plan,
                temporalContext,
                tailoredContext: state.tailoredContext?.serializedContext,
                onEvent: req.onEvent,
                onChunk: req.onChunk,
                abortSignal: req.abortSignal,
              })
            : await dispatcher.executeWorkflow({
                userId: req.userId,
                userName: req.userName,
                userRequest: req.message,
                goal: req.message,
                conversationId: state.conversationId,
                executionId: state.executionId,
                onEvent: req.onEvent,
                onChunk: req.onChunk,
              });

        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;

        let stmUpdates: Record<string, any> = {};
        if (wfResult.pendingOperation) {
          stmUpdates = { pendingOperation: wfResult.pendingOperation };
          try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
              await ConversationShortTermMemory.updateOne(
                { conversationId: state.conversationId, userId: req.userId },
                { $set: stmUpdates },
                { upsert: true }
              );
            }
          } catch (_) {}
        }

        const durationMs = Date.now() - state.startTime;
        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds: [],
          eventIds: [],
          durationMs,
          routingStrategy: routingDecision.strategy,
          terminationReason: wfResult.outcomeStatus,
          timestamp: Date.now(),
        });

        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response: wfResult.response,
            durationMs,
            actionsExecuted: wfResult.actionsExecuted,
            workspaceStatus: wfResult.status,
            terminationReason: wfResult.outcomeStatus,
            traceContext,
            stmUpdates,
            pendingOperation: wfResult.pendingOperation,
            lifeContext: state.lifeContext,
            semanticTurnMeta: {
              primaryClassification: semanticTurn.primaryClassification,
              operationsCount: semanticTurn.operations.length,
              hasOperations: semanticTurn.operations.length > 0,
            },
          },
        };
      })

      .addNode("execute_cancel_or_dismiss", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const semanticTurn = state.semanticTurn!;
        const routingDecision = state.routingDecision!;
        let response = "Understood. I've cancelled that.";
        let stmUpdates: Record<string, any> = {};

        if (state.pendingOp) {
          stmUpdates = { pendingOperation: null };
          response = "Understood. I've cancelled that request.";
        } else if (state.stm?.recentlyExecutedOperations?.length > 0) {
          const reversibleOps = state.stm.recentlyExecutedOperations.filter(
            (o: any) => o.reversibility !== "irreversible_external" && o.success
          );
          if (reversibleOps.length === 1) {
            const targetOp = reversibleOps[0];
            const kernel = rt.kernel || KernelCapabilityService.getInstance();
            try {
              await kernel.compensateAction(targetOp, req.userId);
              const cap = DOMAIN_CAPABILITIES[targetOp.actionType as DomainActionType];
              const noun = cap?.verbalization?.entityNoun || "action";
              response = `I've cancelled and reverted that ${noun} for you.`;
              stmUpdates = {
                recentlyExecutedOperations: state.stm.recentlyExecutedOperations.filter(
                  (o: any) => o.operationId !== targetOp.operationId
                ),
              };
            } catch (_) {
              response = "I couldn't automatically undo that action. Would you like me to remove it manually?";
            }
          } else if (reversibleOps.length > 1) {
            const candidateTitles = reversibleOps
              .map((o: any) => o.targetEntity?.displayName || o.actionType)
              .join('" or "');
            response = `I found multiple recent actions. Which one would you like me to undo: "${candidateTitles}"?`;
            const newPendingOp: IPendingOperationContext = {
              operationId: generateId("pop"),
              turnId: semanticTurn.turnId,
              actionType: reversibleOps[0].actionType,
              domain: reversibleOps[0].domain,
              partialPayload: {},
              missingRequirement: { kind: "TARGET_ENTITY_RESOLUTION", targetEntityType: "task" },
              clarificationQuestion: response,
              candidateEntities: reversibleOps.map((o: any) => ({
                entityId: o.targetEntity?.entityId || o.operationId,
                displayName: o.targetEntity?.displayName || o.actionType,
              })),
              state: "AWAITING_CLARIFICATION",
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            };
            stmUpdates = { pendingOperation: newPendingOp };
            rt.mainExecutionFinished = true;
            rt.fillerSettled = true;
            this.emitText(req, response);
            const traceContext = ProductionTracer.getInstance().recordTrace({
              requestId: state.requestId,
              executionId: state.executionId,
              userId: req.userId,
              actionIds: [],
              eventIds: [],
              durationMs: Date.now() - state.startTime,
              routingStrategy: "CONVERSATIONAL_LLM",
              terminationReason: "AWAITING_CLARIFICATION",
              timestamp: Date.now(),
            });
            return {
              responsePayload: {
                executionId: state.executionId,
                requestId: state.requestId,
                routingDecision,
                response,
                durationMs: Date.now() - state.startTime,
                actionsExecuted: 0,
                workspaceStatus: "COMPLETED",
                terminationReason: "AWAITING_CLARIFICATION",
                traceContext,
                stmUpdates,
                pendingOperation: newPendingOp,
                lifeContext: state.lifeContext,
              },
            };
          }
        }

        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;
        this.emitText(req, response);
        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds: [],
          eventIds: [],
          durationMs: Date.now() - state.startTime,
          routingStrategy: "CONVERSATIONAL_LLM",
          terminationReason: "CANCELLED_BY_USER",
          timestamp: Date.now(),
        });
        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response,
            durationMs: Date.now() - state.startTime,
            actionsExecuted: 0,
            workspaceStatus: "COMPLETED",
            terminationReason: "CANCELLED_BY_USER",
            traceContext,
            stmUpdates,
            lifeContext: state.lifeContext,
          },
        };
      })

      .addNode("execute_clarification", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const semanticTurn = state.semanticTurn!;
        const routingDecision = state.routingDecision!;
        const response = semanticTurn.clarification!.questionToUser!;

        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;
        this.emitText(req, response);

        const op = semanticTurn.operations[0];
        const opPayload = { ...(op?.payload || {}) };
        if (op?.payload?.priority) {
          opPayload.priority = op.payload.priority;
        }
        const newPendingOp: IPendingOperationContext = {
          operationId: op?.operationId || generateId("pop"),
          turnId: semanticTurn.turnId,
          actionType: op?.actionType || "create_task",
          domain: op?.domain || "productivity",
          partialPayload: opPayload,
          missingRequirement: {
            kind: semanticTurn.ambiguityStatus === "ENTITY_AMBIGUOUS" ? "TARGET_ENTITY_RESOLUTION" : "PARAMETER_VALUE",
            targetEntityType: op?.targetReference?.entityType || "task",
            parameterName: op?.targetReference ? "targetEntity" : undefined,
          },
          clarificationQuestion: response,
          candidateEntities: op?.targetReference?.candidateIds?.map((id, i) => ({
            entityId: id,
            displayName: (op.targetReference?.evidence?.candidateTitles || [])[i] || id,
          })),
          state: "AWAITING_CLARIFICATION",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        };
        const stmUpdates = { pendingOperation: newPendingOp };
        try {
          if (mongoose.connection && mongoose.connection.readyState === 1) {
            const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
            await ConversationShortTermMemory.updateOne(
              { conversationId: state.conversationId, userId: req.userId },
              { $set: stmUpdates },
              { upsert: true }
            );
          }
        } catch (_) {}

        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds: [],
          eventIds: [],
          durationMs: Date.now() - state.startTime,
          routingStrategy: "CONVERSATIONAL_LLM",
          terminationReason: "AWAITING_CLARIFICATION",
          timestamp: Date.now(),
        });

        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response,
            durationMs: Date.now() - state.startTime,
            actionsExecuted: 0,
            workspaceStatus: "COMPLETED",
            terminationReason: "AWAITING_CLARIFICATION",
            traceContext,
            stmUpdates,
            pendingOperation: newPendingOp,
            lifeContext: state.lifeContext,
          },
        };
      })

      .addNode("execute_semantic_operations", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        if (req.abortSignal?.aborted) {
          throw createAbortError();
        }
        const semanticTurn = state.semanticTurn!;
        const routingDecision = state.routingDecision!;
        const routingEval = state.routingEval!;
        const bridge = WorldModelBridge.getInstance();

        if (rt.isEventsMode) {
          req.onEvent?.({ type: "status", status: "checking_context", message: "Checking your context..." });
        } else if (!rt.earlyFillerEmitted && !rt.fillerSettled) {
          try {
            const fastFiller = await Promise.race([
              rt.fillerPromise,
              new Promise<null>((res) => setTimeout(() => res(null), 80)),
            ]);
            if (!rt.earlyFillerEmitted && !rt.fillerSettled && !fastFiller && !req.abortSignal?.aborted) {
              const filler = this.getSemanticFiller(semanticTurn);
              if (filler) {
                rt.fillerSettled = true;
                rt.earlyFillerEmitted = true;
                req.onChunk?.(filler.replace(/[.!?\s]+$/, "") + ".\n\n");
              }
            }
          } catch (_) {}
        }

        if (semanticTurn.primaryClassification === "EXPLICIT_CORRECTION") {
          if (state.stm?.recentlyExecutedOperations?.length > 0) {
            const lastOp = state.stm.recentlyExecutedOperations[0];
            const kernel = rt.kernel || KernelCapabilityService.getInstance();
            try {
              await kernel.compensateAction(lastOp, req.userId);
            } catch (_) {}
          }
        }

        const missingProviderInfo = await this.findMissingProviderInfo(
          rt,
          req.userId,
          semanticTurn.operations
        );
        if (missingProviderInfo) {
          rt.mainExecutionFinished = true;
          const resp = await this.handleMissingProviderResponse({
            rt,
            req,
            conversationId: state.conversationId,
            missingProviderInfo,
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            startTime: state.startTime,
            lifeContext: state.lifeContext,
            semanticTurn,
          });
          return { responsePayload: resp };
        }

        // Re-read durable STM from MongoDB before HITL confirmation/claim so LangGraph never owns truth
        let durableStm = state.stm;
        let pendingOp = state.pendingOp;
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          try {
            const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
            const freshStm = await ConversationShortTermMemory.findOne({
              conversationId: state.conversationId,
              userId: req.userId,
            }).lean();
            if (freshStm) {
              durableStm = freshStm;
              pendingOp = (freshStm as any).pendingOperation || null;
            }
          } catch (_) {}
        }

        const sessionAuthorizedScopes: string[] = [...((durableStm as any)?.authorizedScopes || [])];
        const userConfirmedPending =
          pendingOp &&
          (pendingOp as any).state === "AWAITING_CONFIRMATION" &&
          (semanticTurn.primaryClassification === "CONFIRMATION" ||
            semanticTurn.primaryClassification === "CLARIFICATION_RESPONSE" ||
            (semanticTurn.operations.length > 0 &&
              Boolean(
                (semanticTurn.operations[0] as any).confirmationGranted ||
                  semanticTurn.operations[0].executionEligibility === "READY"
              )));

        if (userConfirmedPending && pendingOp) {
          if ((pendingOp as any)?.approvalSignature) {
            const tokenA = (pendingOp as any).claimFencingToken || `fnc_worker_${generateId("w")}`;
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              try {
                const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
                const claimedDoc = await (ConversationShortTermMemory as any).findOneAndUpdate(
                  {
                    conversationId: state.conversationId,
                    userId: req.userId,
                    "pendingOperation.operationId": pendingOp.operationId,
                    "pendingOperation.state": "AWAITING_CONFIRMATION",
                    "pendingOperation.expiresAt": { $gt: new Date() },
                  },
                  {
                    $set: {
                      "pendingOperation.state": "CLAIMED",
                      "pendingOperation.claimedAt": new Date(),
                      "pendingOperation.claimFencingToken": tokenA,
                      "pendingOperation.leaseExpiresAt": new Date(Date.now() + 60000),
                    },
                    $inc: { "pendingOperation.dispatchGeneration": 1 },
                  },
                  { new: true }
                );
                if (!claimedDoc) {
                  const reply = "This action has already been claimed, processed, or expired.";
                  req.onChunk?.(reply);
                  return {
                    responsePayload: {
                      executionId: state.executionId,
                      requestId: state.requestId,
                      routingDecision,
                      response: reply,
                      durationMs: Date.now() - state.startTime,
                      actionsExecuted: 0,
                      workspaceStatus: "COMPLETED",
                      terminationReason: "ALREADY_CLAIMED_OR_EXPIRED",
                    },
                  };
                }
              } catch (_) {}
            }

            const verifyResult = StepDataResolver.verifyApprovalSignature({
              userId: req.userId,
              executionId: pendingOp.executionId || state.executionId,
              operationId: pendingOp.operationId,
              capabilityURN: pendingOp.capabilityURN || (pendingOp.resolvedPayload as any)?.capabilityURN || "",
              expiresAt: pendingOp.expiresAt,
              payload: pendingOp.resolvedPayload || pendingOp.partialPayload,
              signature: (pendingOp as any).approvalSignature,
              keyVersion: (pendingOp as any).keyVersion,
            });
            if (!verifyResult.valid) {
              try {
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                  const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
                  await ConversationShortTermMemory.updateOne(
                    { conversationId: state.conversationId, userId: req.userId },
                    { $set: { "pendingOperation.state": "INVALIDATED" } }
                  );
                }
              } catch (_) {}
              const reply = "Security error: Approved action parameters failed cryptographic integrity verification.";
              req.onChunk?.(reply);
              return {
                responsePayload: {
                  executionId: state.executionId,
                  requestId: state.requestId,
                  routingDecision,
                  response: reply,
                  durationMs: Date.now() - state.startTime,
                  actionsExecuted: 0,
                  workspaceStatus: "COMPLETED",
                  terminationReason: "INTEGRITY_TAMPER_DETECTED",
                },
              };
            }

            if (mongoose.connection && mongoose.connection.readyState === 1) {
              try {
                const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
                const dispatchDoc = await (ConversationShortTermMemory as any).findOneAndUpdate(
                  {
                    conversationId: state.conversationId,
                    userId: req.userId,
                    "pendingOperation.operationId": pendingOp.operationId,
                    "pendingOperation.state": "CLAIMED",
                    "pendingOperation.claimFencingToken": tokenA,
                    "pendingOperation.leaseExpiresAt": { $gt: new Date() },
                  },
                  {
                    $set: {
                      "pendingOperation.state": "DISPATCHED_IN_FLIGHT",
                      "pendingOperation.dispatchedAt": new Date(),
                    },
                  },
                  { new: true }
                );
                if (!dispatchDoc) {
                  const reply = "Action execution aborted: dispatch lease expired or authority was reclaimed.";
                  req.onChunk?.(reply);
                  return {
                    responsePayload: {
                      executionId: state.executionId,
                      requestId: state.requestId,
                      routingDecision,
                      response: reply,
                      durationMs: Date.now() - state.startTime,
                      actionsExecuted: 0,
                      workspaceStatus: "COMPLETED",
                      terminationReason: "FENCED_DISPATCH_ABORT",
                    },
                  };
                }
              } catch (_) {}
            }

            let existingSteps: any[] = [];
            if (pendingOp.executionId) {
              try {
                const restored = await ExecutionPersistenceService.getInstance().restoreWorkspace(
                  pendingOp.executionId,
                  req.userId
                );
                if (restored?.completedSteps) {
                  existingSteps = restored.completedSteps;
                }
              } catch (_) {}
            }

            const dispatcher = IterativeActionDispatcher.getInstance(rt.kernel);
            const wfResult = await dispatcher.resumeWorkflowWithApprovedAction(
              req.userId,
              pendingOp,
              existingSteps,
              { workerId: tokenA, onEvent: req.onEvent, onChunk: req.onChunk }
            );
            const stmUpdates = { pendingOperation: null };
            try {
              if (mongoose.connection && mongoose.connection.readyState === 1) {
                const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
                await ConversationShortTermMemory.updateOne(
                  { conversationId: state.conversationId, userId: req.userId },
                  { $set: stmUpdates }
                );
              }
            } catch (_) {}

            return {
              responsePayload: {
                executionId: state.executionId,
                requestId: state.requestId,
                routingDecision,
                response: wfResult.response,
                durationMs: Date.now() - state.startTime,
                actionsExecuted: wfResult.actionsExecuted,
                workspaceStatus: wfResult.status,
                terminationReason: wfResult.outcomeStatus,
                stmUpdates,
              },
            };
          }

          if (semanticTurn.operations.length === 0 && pendingOp) {
            const restoredPayload = { ...(pendingOp.partialPayload || {}) };
            const capURN =
              restoredPayload.capabilityURN ||
              (restoredPayload as any)?.parameters?.capabilityURN ||
              (pendingOp as any).capabilityURN;
            const providerId =
              restoredPayload.providerId ||
              (restoredPayload as any)?.parameters?.providerId ||
              (pendingOp as any).providerHint;
            const restoredOp: SemanticOperation = {
              operationId: pendingOp.operationId || generateId("op_conf"),
              domain: (pendingOp.domain as any) || "productivity",
              actionType: (pendingOp.actionType as any) || "external_capability_action",
              riskClass: "LOW_REVERSIBLE",
              payload: restoredPayload,
              dependencies: [],
              executionEligibility: "READY",
              capabilityURN: capURN,
              providerHint: providerId,
            };
            (restoredOp as any).confirmationGranted = true;
            const p = String(restoredPayload?.parameters?.path || restoredPayload?.path || "").trim();
            if (p && !sessionAuthorizedScopes.includes(p)) sessionAuthorizedScopes.push(p);
            semanticTurn.operations.push(restoredOp);
          } else {
            for (const op of semanticTurn.operations) {
              (op as any).confirmationGranted = true;
              const p = String(
                op.payload?.parameters?.path ||
                  op.payload?.path ||
                  pendingOp?.partialPayload?.parameters?.path ||
                  pendingOp?.partialPayload?.path ||
                  ""
              ).trim();
              if (p && !sessionAuthorizedScopes.includes(p)) sessionAuthorizedScopes.push(p);
            }
          }
        }

        // HITL Gate governed strictly by CapabilityRegistry
        let hitlRequiredOp: any = null;
        for (const op of semanticTurn.operations) {
          if ((op as any).confirmationGranted) continue;
          const isExplicitConf =
            (op as any).requiresConfirmation === true ||
            (op as any).confirmationMode === "EXPLICIT_CONFIRMATION" ||
            op.riskClass === "HIGH_IRREVERSIBLE";
          const capURN = (op as any).capabilityURN || op.payload?.capabilityURN || "";
          const reqPath = String(op.payload?.parameters?.path || op.payload?.path || "").trim();
          const wasRecentlyExecuted = (durableStm?.recentlyExecutedOperations || []).some((recentOp: any) => {
            const recentPath = String(
              recentOp.payloadSnapshot?.parameters?.path || recentOp.payloadSnapshot?.path || ""
            ).trim();
            return recentPath && reqPath.toLowerCase().startsWith(recentPath.toLowerCase());
          });
          if (
            reqPath &&
            (sessionAuthorizedScopes.some((s) => reqPath.toLowerCase().startsWith(s.toLowerCase())) ||
              wasRecentlyExecuted)
          ) {
            continue;
          }

          const registry = CapabilityRegistry.getInstance();
          const desc = registry.getCapability(capURN || op.actionType);
          const requiresApproval = desc
            ? desc.requiresApproval === true ||
              (desc.requiredResources || []).some((r) => r.accessMode === "EXCLUSIVE_LOCK")
            : true;
          const isReadOperation = desc
            ? (desc.operationKind === "READ" ||
                desc.category === "query" ||
                desc.category === "discovery" ||
                (!desc.isReversible && !desc.requiresApproval)) &&
              desc.requiresApproval !== true
            : false;
          const isWriteMutation = desc ? requiresApproval || isExplicitConf : true;
          if (isWriteMutation && !isReadOperation) {
            hitlRequiredOp = op;
            break;
          }
        }

        if (hitlRequiredOp) {
          const op = hitlRequiredOp;
          const capURN = op.capabilityURN || op.payload?.capabilityURN || "";
          const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any) || {
            displayName: "External Service",
            providerDisplayName: "LifeOS",
            iconName: "Shield",
          };
          const targetPath = String(op.payload?.parameters?.path || op.payload?.path || "").trim();
          const capDesc = CapabilityRegistry.getCapability(capURN);
          const opKind = capDesc?.operationKind || (capDesc?.requiresApproval ? "CREATE" : "READ");
          const entityType = capDesc?.targetEntityType || "item";
          let verbalPrompt = "I'll need your permission to perform this action. Would you like me to proceed?";
          let confirmTitle = "Confirm Action?";
          let confirmMessage = "Aven requires your approval to proceed.";
          let actionLabel = "Write Operation";

          if (entityType === "file" && opKind === "CREATE") {
            const fileName = path.basename(targetPath) || "file";
            verbalPrompt = `I'll need your permission to create ${fileName}. Would you like me to proceed?`;
            confirmTitle = `Allow Creating ${fileName}?`;
            confirmMessage = `Aven requires your approval to write and save ${targetPath || fileName}.`;
            actionLabel = "Create File";
          } else if (opKind === "DELETE") {
            const fileName = targetPath ? path.basename(targetPath) : op.payload?.title || "item";
            verbalPrompt = `I'll need your permission to delete ${fileName}. Would you like me to proceed?`;
            confirmTitle = `Allow Deleting ${fileName}?`;
            confirmMessage = `Aven requires your approval to delete ${fileName}.`;
            actionLabel = "Delete Item";
          } else if (entityType === "email" && (opKind === "CREATE" || opKind === "UPDATE")) {
            const rawTo = op.payload?.parameters?.to;
            const to = (Array.isArray(rawTo) ? rawTo.filter(Boolean).join(", ") : rawTo || "").trim() || "the recipient";
            verbalPrompt = `I'll need your permission to send an email to ${to}. Would you like me to proceed?`;
            confirmTitle = "Confirm Sending Email?";
            confirmMessage = `Aven requires your approval to send email to ${to}.`;
            actionLabel = "Send Email";
          } else if (entityType === "calendar_event" && opKind === "CREATE") {
            const title = op.payload?.parameters?.title || "event";
            verbalPrompt = `I'll need your permission to schedule "${title}" on your calendar. Would you like me to proceed?`;
            confirmTitle = "Confirm Calendar Event?";
            confirmMessage = `Aven requires your approval to schedule "${title}".`;
            actionLabel = "Schedule Event";
          } else if (entityType === "issue" && opKind === "CREATE") {
            const title = op.payload?.parameters?.title || "issue";
            verbalPrompt = `I'll need your permission to create issue "${title}" on GitHub. Would you like me to proceed?`;
            confirmTitle = "Create GitHub Issue?";
            confirmMessage = `Aven requires your approval to open issue "${title}".`;
            actionLabel = "Create Issue";
          } else if (entityType === "workout" && opKind === "CREATE") {
            const wType = op.payload?.parameters?.workoutType || "workout";
            verbalPrompt = `I'll need your permission to log this ${wType} in Google Fit. Would you like me to proceed?`;
            confirmTitle = "Log Workout?";
            confirmMessage = `Aven requires your approval to record this ${wType}.`;
            actionLabel = "Record Workout";
          }

          const newPendingOp: IPendingOperationContext = {
            operationId: op.operationId || generateId("pop"),
            turnId: semanticTurn.turnId,
            actionType: op.actionType,
            domain: op.domain,
            partialPayload: op.payload,
            missingRequirement: { kind: "CONFIRMATION" as any, targetEntityType: "storage" as any },
            clarificationQuestion: verbalPrompt,
            state: "AWAITING_CONFIRMATION" as any,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          };

          req.onEvent?.({ type: "status", status: "waiting_for_confirmation", message: "Awaiting permission..." });
          req.onEvent?.({
            type: "confirmation_required",
            actionId: newPendingOp.operationId,
            capabilityURN: capURN,
            providerDisplayName: pres.providerDisplayName,
            title: confirmTitle,
            message: confirmMessage,
            details: {
              Target: targetPath || op.payload?.title || pres.displayName,
              Action: actionLabel,
              Security: "Approval Required",
            },
            confirmLabel: "Allow",
            cancelLabel: "Deny",
          });

          const stmUpdates = { pendingOperation: newPendingOp };
          try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
              await ConversationShortTermMemory.updateOne(
                { conversationId: state.conversationId, userId: req.userId },
                { $set: stmUpdates },
                { upsert: true }
              );
            }
          } catch (_) {}

          rt.mainExecutionFinished = true;
          this.emitText(req, verbalPrompt);
          return {
            responsePayload: {
              executionId: state.executionId,
              requestId: state.requestId,
              routingDecision,
              response: verbalPrompt,
              durationMs: Date.now() - state.startTime,
              actionsExecuted: 0,
              workspaceStatus: "COMPLETED",
              terminationReason: "AWAITING_CONFIRMATION",
              stmUpdates,
              pendingOperation: newPendingOp,
              lifeContext: state.lifeContext,
            },
          };
        }

        const proposals: ActionProposal[] = semanticTurn.operations.map((op, idx) => {
          const desc = CapabilityRegistry.getInstance().getCapability((op as any).capabilityURN || op.actionType);
          const payload = { ...(op.payload || {}) };
          if (desc?.operationKind !== "READ" && !payload.title) {
            payload.title =
              payload.name ||
              payload.habit ||
              payload.goalTitle ||
              payload.goal ||
              payload.description ||
              op.targetReference?.semanticDescriptor ||
              op.targetReference?.rawExpression;
          }
          const reversibility =
            desc?.reversibility || (desc?.isReversible ? "reversible_with_compensation" : "atomic_single_doc");
          return {
            id: `prop_${op.operationId}_${idx}`,
            planId: `plan_${state.executionId}`,
            actionType: op.actionType,
            domain: op.domain,
            riskClass: op.riskClass,
            reversibility,
            state: "PROPOSED",
            title: payload.title || op.payload?.description || op.actionType,
            rationale: semanticTurn.conversationalSummary,
            payload,
            targetEntityId: op.targetReference?.resolvedEntityId || payload.taskId || payload.goalId,
            requiresConfirmation: op.executionEligibility === "REQUIRES_CLARIFICATION",
            estimatedImpact: op.actionType,
            idempotencyKey: `turn_${semanticTurn.turnId}_${op.operationId}`,
            dependencies: op.dependencies,
          };
        });

        const kernel = rt.kernel || KernelCapabilityService.getInstance();
        const validation = await kernel.validateActionProposals(req.userId, proposals);
        const conflictRejection = validation.rejectedProposals.find(
          (r: any) =>
            r.reason?.includes("CONFLICT_REQUIRES_CLARIFICATION") ||
            r.reason?.includes("taskId is required")
        );

        if (conflictRejection && validation.validDecisions.length === 0) {
          const op = semanticTurn.operations[0];
          let clarificationQuestion = conflictRejection.reason;
          let missingKind: any = "DUPLICATE_CONFIRMATION";
          if (clarificationQuestion.includes("CONFLICT_REQUIRES_CLARIFICATION:")) {
            clarificationQuestion = clarificationQuestion.replace(/^CONFLICT_REQUIRES_CLARIFICATION:\s*/, "");
          } else if (clarificationQuestion.includes("taskId is required")) {
            clarificationQuestion = "Which task would you like me to update?";
            missingKind = "TARGET_ENTITY_RESOLUTION";
          }
          const newPendingOp: IPendingOperationContext = {
            operationId: op?.operationId || generateId("pop"),
            turnId: semanticTurn.turnId,
            actionType: op?.actionType || "create_task",
            domain: op?.domain || "productivity",
            partialPayload: { ...(op?.payload || {}) },
            missingRequirement: { kind: missingKind, targetEntityType: op?.targetReference?.entityType || "task" },
            clarificationQuestion,
            state: "AWAITING_CLARIFICATION",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          };
          const stmUpdates = { pendingOperation: newPendingOp };
          try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
              await ConversationShortTermMemory.updateOne(
                { conversationId: state.conversationId, userId: req.userId },
                { $set: stmUpdates },
                { upsert: true }
              );
            }
          } catch (_) {}
          rt.mainExecutionFinished = true;
          req.onChunk?.(clarificationQuestion);
          return {
            responsePayload: {
              executionId: state.executionId,
              requestId: state.requestId,
              routingDecision,
              response: clarificationQuestion,
              durationMs: Date.now() - state.startTime,
              actionsExecuted: 0,
              workspaceStatus: "COMPLETED",
              terminationReason: "AWAITING_CLARIFICATION",
              stmUpdates,
              pendingOperation: newPendingOp,
              lifeContext: state.lifeContext,
            },
          };
        }

        req.onEvent?.({ type: "status", status: "executing", message: "Working on that..." });
        for (const op of semanticTurn.operations) {
          const capURN =
            op.capabilityURN ||
            (op.actionType === "external_capability_action" ? (op.payload?.capabilityURN as any) : undefined);
          if (capURN) {
            const reqProvId = op.providerHint || op.payload?.providerId;
            const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any, reqProvId);
            req.onEvent?.({
              type: "tool_activity",
              providerId: reqProvId || pres.providerDisplayName.toLowerCase().replace(/\s+/g, "_"),
              providerDisplayName: pres.providerDisplayName,
              capabilityURN: capURN,
              iconName: pres.iconName,
              humanMessage: pres.progressPhrase,
              state: "started",
            });
          }
        }

        const rejectedResults: any[] = (validation.rejectedProposals || []).map((r: any) => ({
          actionId: r.proposalId || r.proposal?.id || generateId("act"),
          operationId: r.proposal?.operationId,
          idempotencyKey: r.proposal?.idempotencyKey || generateId("idem"),
          actionType: r.proposal?.actionType || "external_capability_action",
          status: "FAILED" as const,
          success: false,
          error: r.reason || "Validation failed",
          targetEntityId: r.proposal?.targetEntityId,
          timestamp: Date.now(),
          data: r.proposal?.payload,
        }));

        for (const rej of rejectedResults) {
          const payload = rej.data || {};
          const capURN = payload.capabilityURN || rej.actionType;
          const reqProvId = payload.providerId;
          const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any, reqProvId);
          req.onEvent?.({
            type: "tool_activity",
            providerId: reqProvId || pres.providerDisplayName.toLowerCase().replace(/\s+/g, "_"),
            providerDisplayName: pres.providerDisplayName,
            capabilityURN: capURN,
            iconName: pres.iconName,
            humanMessage: rej.error || pres.failedPhrase || "Could not complete step",
            state: "failed",
            error: rej.error,
          });
        }

        const isReadOnlyBatch =
          routingEval.isReadOnly === true ||
          (semanticTurn.operations.length > 0 &&
            semanticTurn.operations.every((op) => {
              const urn = op.capabilityURN || (op.payload?.capabilityURN as string | undefined) || op.actionType;
              return CapabilityRegistry.getCapability(urn)?.operationKind === "READ";
            }));

        const validDecisionIds = new Set(
          (validation.validDecisions || []).map((d: any) => d.actionId || d.proposalId)
        );
        const kernelResults = isReadOnlyBatch
          ? await Promise.all(
              proposals.filter((p) => validDecisionIds.has(p.id)).map((p) => kernel.executeAction(req.userId, p))
            )
          : await kernel.executeActionBatch(req.userId, validation.validDecisions);

        const allExecutionResults = [...kernelResults, ...rejectedResults];
        const successfulExecutions = allExecutionResults.filter((r: any) => r.success);

        for (let i = 0; i < kernelResults.length; i++) {
          const res = kernelResults[i];
          const op = semanticTurn.operations[i] || semanticTurn.operations[0];
          const capURN =
            op.capabilityURN ||
            (op.actionType === "external_capability_action" ? (op.payload?.capabilityURN as any) : undefined);
          if (capURN) {
            const reqProvId = op.providerHint || op.payload?.providerId;
            const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any, reqProvId);
            const resData = res.data || res.result || {};
            const humanMessage = res.success
              ? pres.completedPhrase
              : res.error?.message || pres.failedPhrase;
            req.onEvent?.({
              type: "tool_activity",
              providerId: reqProvId || pres.providerDisplayName.toLowerCase().replace(/\s+/g, "_"),
              providerDisplayName: pres.providerDisplayName,
              capabilityURN: capURN,
              iconName: pres.iconName,
              humanMessage,
              state: res.success ? "completed" : "failed",
              error: res.success ? undefined : res.error?.message || "Step failed",
              details: {
                nowPlaying: resData.nowPlaying,
                deviceName: resData.deviceName,
                command: resData.command,
                isPlaying: resData.isPlaying,
                itemType: resData.itemType,
                spotifyId: resData.spotifyId,
                spotifyUri: resData.spotifyUri,
                spotifyUrl: resData.spotifyUrl,
                imageUrl: resData.imageUrl,
                artistName: resData.artistName,
                trackName: resData.trackName,
              },
            });
          }
        }

        const { GroundedResponseGenerator, buildExecutionEvidencePackage } = await import(
          "../grounding/GroundedResponseGenerator"
        );
        let response: string;
        if (isReadOnlyBatch) {
          const tz = req.timezone || "UTC";
          const refDate = req.referenceTimeMs ? new Date(req.referenceTimeMs) : new Date();
          let localDate = refDate.toISOString().slice(0, 10);
          try {
            localDate = new Intl.DateTimeFormat("en-CA", {
              timeZone: tz,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(refDate);
          } catch (_) {}
          const evidencePackage = buildExecutionEvidencePackage({
            objective: req.message,
            temporalContext: { localDate, timezone: tz },
            tailoredContextSummary: state.tailoredContext?.serializedContext,
            steps: allExecutionResults.map((res: any, idx: number) => {
              const op = semanticTurn.operations[idx] || semanticTurn.operations[0];
              return {
                stepId: op?.operationId || `op_${idx}`,
                capabilityURN: op?.capabilityURN || res.actionType,
                actionType: res.actionType,
                parameters: op?.payload,
                data: res.data,
                status: res.success ? "SUCCESS" : "FAILED",
                success: Boolean(res.success),
                error: res.error,
                auditId: res.actionId,
              };
            }),
          });
          response = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(evidencePackage);
        } else {
          response = GroundedResponseGenerator.getInstance().generateResponse(
            semanticTurn,
            allExecutionResults,
            { userMessage: req.message, conversationalSummary: semanticTurn.conversationalSummary }
          );
        }

        let activeFocus: IContextEntityRef | null = durableStm?.activeFocus || null;
        let recentEntities: IContextEntityRef[] = [...(durableStm?.recentEntities || [])];
        let recentlyExecutedOperations: IExecutedOperationSnapshot[] = [
          ...(durableStm?.recentlyExecutedOperations || []),
        ];
        if (successfulExecutions.length > 0) {
          bridge.invalidate(req.userId);
        }

        for (let i = 0; i < successfulExecutions.length; i++) {
          const res = successfulExecutions[i];
          const op = semanticTurn.operations[i] || semanticTurn.operations[0];
          const capURN = op?.capabilityURN || (op?.payload?.capabilityURN as string) || "";
          const cap =
            CapabilityRegistry.getCapability(capURN) ||
            DOMAIN_CAPABILITIES[res.actionType as DomainActionType];
          const entityId =
            res.targetEntity?.entityId ||
            res.targetEntityId ||
            res.data?.taskId ||
            res.data?.goalId ||
            res.data?._id ||
            res.data?.id;
          const displayName =
            res.targetEntity?.displayName ||
            res.data?.title ||
            res.data?.taskTitle ||
            res.data?.mealName ||
            res.data?.name ||
            cap?.verbalization?.entityNoun ||
            "item";
          const entityType: any = res.targetEntity?.entityType || cap?.targetEntityType || "task";
          const domain = res.targetEntity?.domain || op?.domain || "productivity";

          if (entityId) {
            activeFocus = {
              entityType,
              entityId: entityId.toString(),
              displayName,
              domain,
              updatedAt: new Date(),
              lastReferencedTurnId: semanticTurn.turnId,
              metadata:
                entityType === "email_draft" && res.data
                  ? {
                      draftId: res.data.draftId,
                      subject: res.data.subject,
                      to: res.data.to,
                      bodyText: res.data.bodyText,
                    }
                  : undefined,
            };
            recentEntities = [
              activeFocus,
              ...recentEntities.filter((e) => e.entityId !== activeFocus!.entityId),
            ].slice(0, 8);
          }

          recentlyExecutedOperations.unshift({
            operationId: op?.operationId || res.operationId || generateId("op"),
            turnId: semanticTurn.turnId,
            actionType: res.actionType,
            domain: op?.domain || "productivity",
            targetEntity: activeFocus
              ? {
                  entityType: activeFocus.entityType,
                  entityId: activeFocus.entityId,
                  displayName: activeFocus.displayName,
                }
              : undefined,
            payloadSnapshot: op?.payload || {},
            success: true,
            executedAt: new Date(),
            reversibility:
              op?.riskClass === "HIGH_IRREVERSIBLE" ? "irreversible_external" : "atomic_single_doc",
          });
        }
        recentlyExecutedOperations = recentlyExecutedOperations.slice(0, 5);

        let nextPendingOperation: IPendingOperationContext | null = null;
        const proposedGoalRes = successfulExecutions.find((res: any) => res.actionType === "propose_goal");
        if (proposedGoalRes) {
          const pGoalId =
            proposedGoalRes.targetEntity?.entityId ||
            proposedGoalRes.data?.goalId ||
            proposedGoalRes.data?._id;
          const pGoalTitle =
            proposedGoalRes.targetEntity?.displayName || proposedGoalRes.data?.title || "goal";
          nextPendingOperation = {
            operationId: generateId("pop"),
            turnId: semanticTurn.turnId,
            actionType: "confirm_goal",
            domain: "productivity",
            partialPayload: { goalId: pGoalId?.toString(), title: pGoalTitle },
            missingRequirement: { kind: "CONFIRMATION" as any, targetEntityType: "goal" },
            clarificationQuestion: response,
            candidateEntities: pGoalId ? [{ entityId: pGoalId.toString(), displayName: pGoalTitle }] : [],
            state: "AWAITING_CLARIFICATION",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          };
          req.onEvent?.({
            type: "status",
            status: "waiting_for_confirmation",
            message: "Waiting for your confirmation...",
          });
          req.onEvent?.({
            type: "confirmation_required",
            actionId: nextPendingOperation.operationId,
            capabilityURN: "productivity.goal",
            providerDisplayName: "LifeOS",
            title: pGoalTitle,
            message: response,
            confirmLabel: "Confirm",
            cancelLabel: "Cancel",
          });
        }

        const stmUpdates = {
          activeFocus,
          recentEntities,
          pendingOperation: nextPendingOperation,
          recentlyExecutedOperations,
          authorizedScopes: sessionAuthorizedScopes,
        };
        try {
          if (mongoose.connection && mongoose.connection.readyState === 1) {
            const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
            await ConversationShortTermMemory.updateOne(
              { conversationId: state.conversationId, userId: req.userId },
              { $set: stmUpdates },
              { upsert: true }
            );
          }
        } catch (_) {}

        rt.mainExecutionFinished = true;
        this.emitText(req, response);

        const actionIds = kernelResults.map((r: any) => r.actionId);
        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds,
          eventIds: [],
          durationMs: Date.now() - state.startTime,
          routingStrategy: routingDecision.strategy,
          terminationReason: "GOAL_SATISFIED",
          timestamp: Date.now(),
        });

        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response,
            durationMs: Date.now() - state.startTime,
            actionsExecuted: successfulExecutions.length,
            workspaceStatus: "COMPLETED",
            terminationReason: "GOAL_SATISFIED",
            traceContext,
            stmUpdates,
            lifeContext: state.lifeContext,
            semanticTurnMeta: {
              primaryClassification: semanticTurn.primaryClassification,
              operationsCount: semanticTurn.operations.length,
              hasOperations: semanticTurn.operations.length > 0,
            },
          },
        };
      })

      .addNode("execute_conversational_llm", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        if (req.abortSignal?.aborted) {
          throw createAbortError();
        }
        const semanticTurn = state.semanticTurn!;
        const routingDecision = state.routingDecision!;

        if (semanticTurn.primaryClassification === "INFORMATION_QUERY") {
          if (rt.isEventsMode) {
            req.onEvent?.({ type: "status", status: "checking_context", message: "Checking your context..." });
          } else if (!rt.earlyFillerEmitted && !rt.fillerSettled) {
            const queryFiller = this.getSemanticFiller(semanticTurn);
            if (queryFiller) {
              rt.fillerSettled = true;
              rt.earlyFillerEmitted = true;
              req.onChunk?.(queryFiller.replace(/[.!?\s]+$/, "") + ".\n\n");
            }
          }
        }

        const historyMessages: { role: "system" | "user" | "assistant"; content: string }[] =
          (state.loadedState?.recentMessages || []).slice(-14).map((m: any) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
            content: m.content || "",
          }));

        let resolvedUserName = req.userName?.trim();
        const genericNames = new Set(["mobile", "mobile user", "user", "client", "guest"]);
        if ((!resolvedUserName || genericNames.has(resolvedUserName.toLowerCase())) && req.userId) {
          try {
            const { User } = await import("@/server/db/models/User");
            const user = await User.findById(req.userId).select("name").lean();
            if (user && (user as any).name) resolvedUserName = (user as any).name.trim();
          } catch (_) {}
        }
        const activeUserName = extractFirstName(resolvedUserName || AVEN_IDENTITY.defaultUserName || "Daksh");

        let contextProjection = "";
        if (state.stm?.activeFocus || state.stm?.pendingOperation || state.stm?.recentEntities?.length > 0) {
          contextProjection = "\n\nACTIVE CONVERSATIONAL CONTEXT:\n";
          if (state.stm.activeFocus) {
            contextProjection += `- Active Focus: "${state.stm.activeFocus.displayName}" (${state.stm.activeFocus.entityType}, domain: ${state.stm.activeFocus.domain})\n`;
          }
          if (state.stm.pendingOperation) {
            const pendingTarget =
              state.stm.pendingOperation.partialPayload?.title ||
              state.stm.pendingOperation.candidateEntities?.[0]?.displayName ||
              "item";
            contextProjection += `- Pending Operation: ${state.stm.pendingOperation.actionType} on "${pendingTarget}" (State: ${state.stm.pendingOperation.state})\n`;
          }
          if (state.stm.recentEntities?.length > 0) {
            contextProjection += `- Recently Referenced Entities: ${state.stm.recentEntities
              .map((e: any) => `"${e.displayName}" (${e.entityType})`)
              .join(", ")}\n`;
          }
        }
        if (state.tailoredContext?.serializedContext) {
          contextProjection += `\n\nLIFEOS WORLD CONTEXT:\n${state.tailoredContext.serializedContext}\n`;
        }
        if (req.surfaceContext?.activeExecutionTitle) {
          contextProjection += `\n[SITUATIONAL AMBIENT CONTEXT]: The user is currently focusing on '${req.surfaceContext.activeExecutionTitle}'. Keep responses concise.\n`;
        }
        if (req.surfaceContext?.sourceSurface === "DESKTOP_HUD") {
          contextProjection += `\n[SURFACE CONTEXT: DESKTOP HUD VOICE DUPLEX]: Keep replies natural, spoken, 1-3 sentences. Append '<dialogue_status>concluded</dialogue_status>' only if the user explicitly concludes the conversation.\n`;
        }

        const systemPrompt =
          buildSupervisorPersonaPrompt(activeUserName) +
          contextProjection +
          "\n\nCRITICAL FORMATTING RULES:\n" +
          "1. NEVER output markdown tables, pipe grids (|), or ASCII divider lines (---).\n" +
          "2. Keep replies natural, concise, and end sentences with clear punctuation.\n" +
          "3. Never output internal thought tags or raw JSON.\n" +
          "4. INVARIANT 9: You did NOT execute any external tools or database mutations in this turn.";

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...historyMessages,
          { role: "user" as const, content: req.message },
        ];

        let responseText = "";
        let streamedAny = false;
        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") {
          try {
            req.onEvent?.({ type: "status", status: "synthesizing", message: "Composing response..." });
            const rawResponse = await streamLifeOSChat({
              messages,
              model: resolveGroqModel(),
              temperature: 0.6,
              maxTokens: 800,
              signal: req.abortSignal,
              onDelta: (delta) => {
                if (delta) {
                  streamedAny = true;
                  req.onChunk?.(delta);
                  req.onEvent?.({ type: "assistant_delta", text: delta });
                }
              },
            });
            responseText = cleanLLMResponse(rawResponse).trim();
          } catch (llmErr: any) {
            if (isAbortError(llmErr) || req.abortSignal?.aborted) throw createAbortError();
            if (streamedAny) throw llmErr;
            console.warn("[LANGGRAPH] Conversational LLM call fallback:", llmErr);
          }
        }

        if (!responseText) {
          responseText = `I'm with you, ${activeUserName}. What are we working on?`;
        }

        const lowerResp = responseText.toLowerCase();
        const claimsPlayback =
          (lowerResp.includes("playing ") &&
            (lowerResp.includes("spotify") || lowerResp.includes("track") || lowerResp.includes("playlist"))) ||
          (lowerResp.includes("pausing ") &&
            (lowerResp.includes("track") || lowerResp.includes("music") || lowerResp.includes("spotify"))) ||
          lowerResp.includes("paused spotify");
        if (claimsPlayback) {
          responseText = `I couldn't trigger that playback right now, ${activeUserName}. Would you like me to try again?`;
        }

        let stmUpdates: Record<string, any> | undefined;
        const asksConfirmation =
          responseText.includes("?") &&
          (lowerResp.includes("shall i") ||
            lowerResp.includes("would you like me to") ||
            lowerResp.includes("should i") ||
            lowerResp.includes("do you want me to") ||
            lowerResp.includes("would you like to confirm"));
        if (asksConfirmation) {
          stmUpdates = {
            pendingOperation: {
              operationId: generateId("pop"),
              turnId: generateId("turn"),
              actionType: (state.stm?.activeFocus?.entityType === "goal"
                ? "confirm_goal"
                : "create_temporal_series") as DomainActionType,
              domain: "productivity",
              partialPayload: {},
              missingRequirement: { kind: "CONFIRMATION" as any },
              clarificationQuestion: responseText,
              state: "AWAITING_CLARIFICATION",
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            },
          };
          try {
            if (mongoose.connection && mongoose.connection.readyState === 1) {
              const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
              await ConversationShortTermMemory.updateOne(
                { conversationId: state.conversationId, userId: req.userId },
                { $set: stmUpdates },
                { upsert: true }
              );
            }
          } catch (_) {}
        }

        const durationMs = Date.now() - state.startTime;
        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          actionIds: [],
          eventIds: [],
          durationMs,
          routingStrategy: "CONVERSATIONAL_LLM",
          terminationReason: "CONVERSATIONAL_RESPONSE",
          timestamp: Date.now(),
        });

        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;
        if (!streamedAny) {
          this.emitText(req, responseText);
        }

        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response: responseText,
            durationMs,
            actionsExecuted: 0,
            workspaceStatus: "COMPLETED",
            terminationReason: "CONVERSATIONAL_RESPONSE",
            traceContext,
            stmUpdates,
            pendingOperation: stmUpdates?.pendingOperation,
            lifeContext: state.lifeContext,
            semanticTurnMeta: {
              primaryClassification: semanticTurn.primaryClassification,
              operationsCount: semanticTurn.operations.length,
              hasOperations: semanticTurn.operations.length > 0,
            },
          },
        };
      })

      .addNode("execute_react_specialists", async (state: ConversationGraphStateType) => {
        const rt = this.getRuntime(state.executionId);
        const { req } = rt;
        const routingDecision = state.routingDecision!;
        const semanticTurn = state.semanticTurn!;

        let acknowledgement = "";
        if (!rt.isEventsMode && !rt.earlyFillerEmitted && !rt.fillerSettled) {
          acknowledgement = this.getExecutiveAcknowledgement(req.message, routingDecision);
          if (acknowledgement) {
            rt.fillerSettled = true;
            rt.earlyFillerEmitted = true;
            req.onChunk?.(acknowledgement.replace(/[.!?\s]+$/, "") + ".\n\n");
          }
        }

        let contextualGoal = req.message;
        if (state.loadedState?.recentMessages?.length > 0) {
          const recent = state.loadedState.recentMessages
            .slice(-14)
            .map((m: any) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
            .join("\n");
          if (recent.trim().length > 0) {
            contextualGoal = `Recent conversation context:\n${recent}\n\nCurrent User Request: ${req.message}`;
          }
        }

        const workspace = new ExecutionWorkspace({
          executionId: state.executionId,
          userId: req.userId,
          conversationId: req.conversationId,
          userRequest: req.message,
          goal: contextualGoal,
          constraints: [],
        });

        const targetSpecialists =
          routingDecision.selectedSpecialists ||
          (routingDecision.targetDomain ? [routingDecision.targetDomain] : undefined);
        const orchestrator = rt.reactOrchestrator || ReActOrchestrator.createDefault(rt.kernel);
        const reactResult: ReActLoopResult = await orchestrator.runLoop(
          state.executionId,
          req.userId,
          contextualGoal,
          workspace,
          undefined,
          targetSpecialists,
          semanticTurn
        );

        rt.mainExecutionFinished = true;
        rt.fillerSettled = true;
        this.emitText(req, reactResult.userSummary);

        const fullResponse = acknowledgement
          ? `${acknowledgement} ${reactResult.userSummary}`.trim()
          : reactResult.userSummary;
        const durationMs = Date.now() - state.startTime;
        const actionsExecuted = reactResult.executedActions.filter((a) => a.success).length;
        const actionIds = reactResult.executedActions.map((a) => a.actionId);
        const eventIds = workspace.ledger.getEvents().map((e) => e.id);

        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId: state.requestId,
          executionId: state.executionId,
          userId: req.userId,
          memorySnapshotId: state.executionId,
          actionIds,
          eventIds,
          durationMs,
          routingStrategy: routingDecision.strategy,
          terminationReason: reactResult.terminationReason,
          timestamp: Date.now(),
        });

        return {
          responsePayload: {
            executionId: state.executionId,
            requestId: state.requestId,
            routingDecision,
            response: fullResponse,
            durationMs,
            actionsExecuted,
            workspaceStatus: workspace.getState().status,
            terminationReason: reactResult.terminationReason,
            traceContext,
            lifeContext: state.lifeContext,
          },
        };
      })

      .addNode("finalize_turn", async (state: ConversationGraphStateType) => {
        if (!state.responsePayload) {
          throw new Error(`[LifeOSOrchestrationGraph] Finalize reached without responsePayload`);
        }
        return {};
      })

      .addEdge(START, "prepare_context")
      .addEdge("prepare_context", "interpret_intent")
      .addEdge("interpret_intent", "route_turn")
      .addConditionalEdges("route_turn", (state: ConversationGraphStateType) => {
        switch (state.routeTarget) {
          case "fast_atomic":
            return "execute_fast_atomic";
          case "unregistered_capability":
            return "execute_unregistered";
          case "dynamic_workflow":
            return "execute_dynamic_workflow";
          case "cancel_or_dismiss":
            return "execute_cancel_or_dismiss";
          case "clarification":
            return "execute_clarification";
          case "semantic_operations":
            return "execute_semantic_operations";
          case "conversational_llm":
            return "execute_conversational_llm";
          default:
            return "execute_react_specialists";
        }
      })
      .addConditionalEdges("execute_fast_atomic", (state: ConversationGraphStateType) =>
        state.responsePayload ? "finalize_turn" : "execute_react_specialists"
      )
      .addEdge("execute_unregistered", "finalize_turn")
      .addEdge("execute_dynamic_workflow", "finalize_turn")
      .addEdge("execute_cancel_or_dismiss", "finalize_turn")
      .addEdge("execute_clarification", "finalize_turn")
      .addEdge("execute_semantic_operations", "finalize_turn")
      .addEdge("execute_conversational_llm", "finalize_turn")
      .addEdge("execute_react_specialists", "finalize_turn")
      .addEdge("finalize_turn", END);

    return workflow;
  }

  async runTurn(params: {
    req: SupervisorRequest;
    router: DynamicRouter;
    kernel?: any;
    reactOrchestrator?: ReActOrchestrator;
    connectionChecker?: IProviderConnectionChecker;
    runnableConfig?: RunnableConfig;
  }): Promise<SupervisorResponse> {
    const { req } = params;
    if (req.abortSignal?.aborted) {
      throw createAbortError();
    }

    const startTime = Date.now();
    const executionId = req.executionId || generateId("exec");
    const requestId = req.requestId || generateId("req");
    const conversationId = req.conversationId || "default";
    const isEventsMode = req.streamMode === "events";

    req.onEvent?.({
      type: "status",
      status: "understanding",
      message: "Understanding your request...",
    });

    const rt: TurnRuntimeContext = {
      req,
      router: params.router,
      kernel: params.kernel,
      reactOrchestrator: params.reactOrchestrator,
      connectionChecker: params.connectionChecker,
      isEventsMode,
      earlyFillerEmitted: false,
      mainExecutionFinished: false,
      fillerSettled: false,
      fillerPromise: Promise.resolve(null),
    };

    if (!isEventsMode && req.onChunk) {
      rt.fillerPromise = FastSemanticFiller.getInstance()
        .generateFiller(req.message)
        .then((filler) => {
          if (
            filler &&
            !rt.mainExecutionFinished &&
            !rt.fillerSettled &&
            !req.abortSignal?.aborted &&
            req.onChunk
          ) {
            rt.fillerSettled = true;
            rt.earlyFillerEmitted = true;
            req.onChunk(filler.replace(/[.!?\s]+$/, "") + ".\n\n");
            return filler;
          }
          return null;
        })
        .catch(() => null);
    }

    this.runtimeContexts.set(executionId, rt);

    const existingTrace = getActiveTraceContext();
    const ownsTrace = !existingTrace;
    const langsmithActive = isLangSmithEnabled();
    if (langsmithActive) {
      syncLangSmithEnv();
    }
    const langsmithRunId = existingTrace?.langsmithRunId || (langsmithActive ? generateId("ls") : undefined);
    const langsmithUrl =
      existingTrace?.langsmithUrl || (langsmithRunId ? buildLangSmithRunUrl(langsmithRunId) : undefined);

    const traceCtx: ActiveTraceContext =
      existingTrace ||
      createTraceContext({
        requestId,
        executionId,
        conversationId,
        userId: req.userId,
        surface: req.surfaceContext?.sourceSurface === "DESKTOP_HUD" ? "desktop_hud" : "aven_chat",
        langsmithRunId,
        langsmithUrl,
      });

    if (langsmithRunId && !traceCtx.langsmithRunId) {
      traceCtx.langsmithRunId = langsmithRunId;
      traceCtx.langsmithUrl = langsmithUrl;
    }

    const executeGraph = async (): Promise<SupervisorResponse> => {
      const traceCallback = new LifeOSTraceCallbackHandler();
      const baseConfig = buildLangGraphThreadConfig({
        userId: req.userId,
        executionId,
        recursionLimit: 25,
        metadata: {
          traceId: traceCtx.traceId,
          requestId,
          conversationId,
          surface: req.surfaceContext?.sourceSurface || "aven_chat",
        },
        tags: ["lifeos:conversation_turn"],
      });
      const config = {
        ...baseConfig,
        ...(langsmithRunId ? { runId: langsmithRunId } : {}),
        ...(params.runnableConfig || {}),
        callbacks: [
          traceCallback,
          ...((Array.isArray(params.runnableConfig?.callbacks) ? params.runnableConfig.callbacks : []) as any[]),
        ],
      };

      let finalResp: SupervisorResponse | undefined;
      let graphErr: any;
      try {
        const finalState: ConversationGraphStateType = await this.compiledGraph.invoke(
          {
            executionId,
            requestId,
            userId: req.userId,
            userName: req.userName,
            conversationId,
            message: req.message,
            timezone: req.timezone,
            referenceTimeMs: req.referenceTimeMs,
            streamMode: req.streamMode,
            startTime,
          },
          config
        );
        if (!finalState.responsePayload) {
          throw new Error("[LifeOSOrchestrationGraph] Graph completed without responsePayload");
        }
        finalResp = finalState.responsePayload;
        return finalResp;
      } catch (err) {
        graphErr = err;
        throw err;
      } finally {
        if (ownsTrace) {
          const status = graphErr
            ? "FAILED"
            : finalResp?.terminationReason === "AWAITING_CONFIRMATION"
              ? "AWAITING_CONFIRMATION"
              : finalResp?.terminationReason === "AWAITING_CLARIFICATION"
                ? "AWAITING_CLARIFICATION"
                : "COMPLETED";
          void TracePersistenceService.getInstance().persistTrace({
            ctx: traceCtx,
            status,
            routingStrategy: finalResp?.routingDecision?.strategy,
            terminationReason: finalResp?.terminationReason || (graphErr ? "ERROR" : undefined),
            userMessage: req.message,
            finalResponse: finalResp?.response,
            finalFrontendPayload: finalResp
              ? {
                  response: finalResp.response,
                  actionsExecuted: finalResp.actionsExecuted,
                  terminationReason: finalResp.terminationReason,
                  pendingOperation: finalResp.pendingOperation ? { actionType: finalResp.pendingOperation.actionType } : undefined,
                }
              : undefined,
          });
        }
      }
    };

    try {
      return ownsTrace ? await runWithTraceContext(traceCtx, executeGraph) : await executeGraph();
    } finally {
      this.runtimeContexts.delete(executionId);
    }
  }
}
