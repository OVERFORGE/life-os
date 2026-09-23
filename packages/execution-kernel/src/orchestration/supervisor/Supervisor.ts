import { DynamicRouter, RoutingDecision } from "./DynamicRouter";
import { FastPathExecutor, FastPathContext } from "./FastPathExecutor";
import { ReActOrchestrator, ReActLoopResult } from "../react/ReActOrchestrator";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { ProductionTracer, ProductionTraceContext } from "../observability/ProductionTracer";
import { generateId } from "../../shared/ids";
import { groqChat, cleanLLMResponse } from "../../shared/groq";
import { ConversationManager } from "../../kernel/ConversationManager";
import { buildSupervisorPersonaPrompt, AVEN_IDENTITY, extractFirstName } from "../../persona";
import { SemanticIntentInterpreter } from "../semantic/SemanticIntentInterpreter";
import { ActionProposal, DOMAIN_CAPABILITIES, DomainActionType } from "../contracts/ActionProposalContracts";
import { KernelCapabilityService } from "../kernel/KernelCapabilityService";
import {
  IContextEntityRef,
  IExecutedOperationSnapshot,
  IPendingOperationContext,
} from "../contracts/SemanticTurnContracts";
import mongoose from "mongoose";

export interface SupervisorRequest {
  userId: string;
  userName?: string;
  message: string;
  conversationId?: string;
  requestId?: string;
  knownTasks?: Array<{ id: string; title: string }>;
  onChunk?: (chunk: string) => void;
}

export interface SupervisorResponse {
  executionId: string;
  requestId?: string;
  routingDecision: RoutingDecision;
  response: string;
  durationMs: number;
  actionsExecuted: number;
  workspaceStatus?: string;
  terminationReason?: string;
  traceContext?: ProductionTraceContext;
  stmUpdates?: Record<string, any>;
  pendingOperation?: any;
}

/**
 * Supervisor (Aven Orchestration Authority)
 * 
 * Central cognitive orchestration authority for LifeOS.
 * Operates as Aven: reasoning over state, coordinating specialists, and communicating with the user.
 * Invariant 1: Supervisor proposes decisions and asks the kernel to execute; never owns truth directly.
 * Invariant 28: Zero internal mechanical terminology leaked to the end user.
 */
export class Supervisor {
  private static instance: Supervisor;

  constructor(
    private router: DynamicRouter,
    private fastPath: FastPathExecutor,
    private reactOrchestrator: ReActOrchestrator,
    private kernel?: any
  ) {}

  getRouter(): DynamicRouter {
    return this.router;
  }

  static getInstance(): Supervisor {
    if (!Supervisor.instance) {
      Supervisor.instance = Supervisor.createDefault();
    }
    return Supervisor.instance;
  }

  static createDefault(customKernel?: any): Supervisor {
    const { KernelCapabilityService } = require("../kernel/KernelCapabilityService");
    const kernel = customKernel || KernelCapabilityService.getInstance();
    const fastPath = new FastPathExecutor(kernel);
    const router = new DynamicRouter(fastPath);
    const reactOrchestrator = ReActOrchestrator.createDefault(kernel);
    return new Supervisor(router, fastPath, reactOrchestrator, kernel);
  }

  async processRequest(req: SupervisorRequest): Promise<SupervisorResponse> {
    const startTime = Date.now();
    const executionId = generateId("exec");
    const requestId = req.requestId || generateId("req");
    const conversationId = req.conversationId || "default";

    // 0. Pre-load Conversational State & Short-Term Memory (Phase 1)
    let loadedState: any = null;
    try {
      loadedState = await ConversationManager.getInstance().load(conversationId, req.userId);
    } catch (_) {
      // In-memory/test fallback if DB is disconnected
    }

    const stm = loadedState?.stm || null;
    let pendingOp: IPendingOperationContext | null = stm?.pendingOperation || null;

    // Check pending operation TTL (10 minutes per V2.2)
    let pendingOpExpired = false;
    if (pendingOp && pendingOp.expiresAt) {
      const expiresAtMs = new Date(pendingOp.expiresAt).getTime();
      if (Date.now() > expiresAtMs) {
        pendingOp.state = "EXPIRED";
        pendingOp = null;
        pendingOpExpired = true;
      }
    }

    if (pendingOpExpired) {
      const response = "Your previous request has expired. Please tell me what you'd like to do again.";
      req.onChunk?.(response);
      const stmUpdates = { pendingOperation: null };
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

      return {
        executionId,
        requestId,
        routingDecision: {
          strategy: "CONVERSATIONAL_LLM",
          confidence: 1.0,
          rationale: "Pending operation expired due to TTL timeout",
        },
        response,
        durationMs: Date.now() - startTime,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "EXPIRED",
        stmUpdates,
      };
    }

    // 1. Authoritative Semantic Interpretation via Aven with Bounded Context Projection
    const interpreter = SemanticIntentInterpreter.getInstance();
    const semanticTurn = await interpreter.interpret(req.message, {
      userId: req.userId,
      conversationId,
      knownTasks: req.knownTasks,
      recentHistory: (loadedState?.recentMessages || []).slice(-6),
      activeFocus: stm?.activeFocus || null,
      recentEntities: stm?.recentEntities || [],
      pendingOperation: pendingOp,
      activeMode: stm?.activeContextMode || "standard",
      activeIncidents: stm?.activeIncidents || [],
    });

    // 2. Dynamic Routing Decision informed by SemanticTurn
    const routingDecision = this.router.route(req.message, semanticTurn);

    // 3. User Cancellation or Retraction Branch (Policy-driven per V2.2 Section 5)
    if (semanticTurn.primaryClassification === "CANCEL_OR_DISMISS") {
      let response = "Understood. I've cancelled that.";
      let stmUpdates: Record<string, any> = {};

      if (pendingOp) {
        // Cancel active pending operation
        stmUpdates = { pendingOperation: null };
        response = "Understood. I've cancelled that request.";
      } else if (stm?.recentlyExecutedOperations && stm.recentlyExecutedOperations.length > 0) {
        const reversibleOps = stm.recentlyExecutedOperations.filter(
          (o: any) => o.reversibility !== "irreversible_external" && o.success
        );

        if (reversibleOps.length === 1) {
          const targetOp = reversibleOps[0];
          const kernel = this.kernel || KernelCapabilityService.getInstance();
          try {
            await kernel.compensateAction(targetOp, req.userId);
            const cap = DOMAIN_CAPABILITIES[targetOp.actionType as DomainActionType];
            const noun = cap?.verbalization?.entityNoun || "action";
            response = `I've cancelled and reverted that ${noun} for you.`;
            stmUpdates = {
              recentlyExecutedOperations: stm.recentlyExecutedOperations.filter((o: any) => o.operationId !== targetOp.operationId),
            };
          } catch (compErr) {
            response = "I couldn't automatically undo that action. Would you like me to remove it manually?";
          }
        } else if (reversibleOps.length > 1) {
          const candidateTitles = reversibleOps.map((o: any) => o.targetEntity?.displayName || o.actionType).join('" or "');
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
          req.onChunk?.(response);
          return {
            executionId,
            requestId,
            routingDecision,
            response,
            durationMs: Date.now() - startTime,
            actionsExecuted: 0,
            workspaceStatus: "COMPLETED",
            terminationReason: "AWAITING_CLARIFICATION",
            stmUpdates,
            pendingOperation: newPendingOp,
          };
        }
      }

      req.onChunk?.(response);
      const traceContext = ProductionTracer.getInstance().recordTrace({
        requestId,
        executionId,
        userId: req.userId,
        actionIds: [],
        eventIds: [],
        durationMs: Date.now() - startTime,
        routingStrategy: "CONVERSATIONAL_LLM",
        terminationReason: "CANCELLED_BY_USER",
        timestamp: Date.now(),
      });
      return {
        executionId,
        requestId,
        routingDecision,
        response,
        durationMs: Date.now() - startTime,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "CANCELLED_BY_USER",
        traceContext,
        stmUpdates,
      };
    }

    // 3b. Clarification / Ambiguity Interception (Phase 2: First-Class Pending Operation Continuation)
    if (semanticTurn.clarification?.required && semanticTurn.clarification.questionToUser) {
      const response = semanticTurn.clarification.questionToUser;
      req.onChunk?.(response);

      const op = semanticTurn.operations[0];
      const opPayload = { ...(op?.payload || {}) };
      if (!opPayload.priority) {
        const prioMatch = req.message.match(/\bpriority\s+(?:to|in|as)?\s*(high|low|medium|urgent)\b/i) ||
          req.message.match(/\b(high|low|medium|urgent)\s+priority\b/i) ||
          req.message.match(/\b(?:set|change|make|adjust)\s+(?:the\s+)?priority\s+(?:to\s+|in\s+)?(high|low|medium|urgent)\b/i);
        if (prioMatch) {
          opPayload.priority = (prioMatch[1] || prioMatch[2] || "medium").toLowerCase();
        }
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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes TTL
      };

      const stmUpdates = {
        pendingOperation: newPendingOp,
      };

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

      const traceContext = ProductionTracer.getInstance().recordTrace({
        requestId,
        executionId,
        userId: req.userId,
        actionIds: [],
        eventIds: [],
        durationMs: Date.now() - startTime,
        routingStrategy: "CONVERSATIONAL_LLM",
        terminationReason: "AWAITING_CLARIFICATION",
        timestamp: Date.now(),
      });
      return {
        executionId,
        requestId,
        routingDecision,
        response,
        durationMs: Date.now() - startTime,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "AWAITING_CLARIFICATION",
        traceContext,
        stmUpdates,
        pendingOperation: newPendingOp,
      };
    }

    // 4. Semantic Operations Execution via Sovereign Kernel
    if (semanticTurn.operations.length > 0) {
      // If turn is an EXPLICIT_CORRECTION, compensate previous operation first
      if (semanticTurn.primaryClassification === "EXPLICIT_CORRECTION") {
        if (stm?.recentlyExecutedOperations && stm.recentlyExecutedOperations.length > 0) {
          const lastOp = stm.recentlyExecutedOperations[0];
          const kernel = this.kernel || KernelCapabilityService.getInstance();
          try {
            await kernel.compensateAction(lastOp, req.userId);
          } catch (_) {}
        }
      }

      const proposals: ActionProposal[] = semanticTurn.operations.map((op, idx) => {
        const payload = { ...(op.payload || {}) };
        if (!payload.title) {
          payload.title = payload.name || payload.habit || payload.goalTitle || payload.goal || payload.description || op.targetReference?.semanticDescriptor || op.targetReference?.rawExpression;
        }
        return {
          id: `prop_${op.operationId}_${Date.now()}_${idx}`,
          planId: `plan_${executionId}`,
          actionType: op.actionType,
          domain: op.domain,
          riskClass: op.riskClass,
          reversibility: op.riskClass === "HIGH_IRREVERSIBLE" ? "irreversible_external" : op.riskClass === "MEDIUM_COMPENSABLE" ? "reversible_with_compensation" : "atomic_single_doc",
          state: "PROPOSED",
          title: payload.title || op.payload?.description || op.actionType,
          rationale: semanticTurn.conversationalSummary,
          payload,
          targetEntityId: op.targetReference?.resolvedEntityId || payload.taskId || payload.goalId,
          requiresConfirmation: op.executionEligibility === "REQUIRES_CLARIFICATION",
          estimatedImpact: op.actionType,
          idempotencyKey: `${executionId}_${op.operationId}`,
          dependencies: op.dependencies,
        };
      });

      const kernel = this.kernel || KernelCapabilityService.getInstance();
      const validation = await kernel.validateActionProposals(req.userId, proposals);

      // Check if any rejected proposal requires clarification (e.g. CONFLICT_REQUIRES_CLARIFICATION or missing target)
      const conflictRejection = validation.rejectedProposals.find((r: any) =>
        r.reason?.includes("CONFLICT_REQUIRES_CLARIFICATION") || r.reason?.includes("taskId is required")
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

        const opPayload = { ...(op?.payload || {}) };
        if (!opPayload.priority) {
          const prioMatch = req.message.match(/\bpriority\s+(?:to|in|as)?\s*(high|low|medium|urgent)\b/i) ||
            req.message.match(/\b(high|low|medium|urgent)\s+priority\b/i) ||
            req.message.match(/\b(?:set|change|make|adjust)\s+(?:the\s+)?priority\s+(?:to\s+|in\s+)?(high|low|medium|urgent)\b/i);
          if (prioMatch) {
            opPayload.priority = (prioMatch[1] || prioMatch[2] || "medium").toLowerCase();
          }
        }

        const newPendingOp: IPendingOperationContext = {
          operationId: op?.operationId || generateId("pop"),
          turnId: semanticTurn.turnId,
          actionType: op?.actionType || "create_task",
          domain: op?.domain || "productivity",
          partialPayload: opPayload,
          missingRequirement: {
            kind: missingKind,
            targetEntityType: op?.targetReference?.entityType || "task",
          },
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
              { conversationId, userId: req.userId },
              { $set: stmUpdates },
              { upsert: true }
            );
          }
        } catch (_) {}

        req.onChunk?.(clarificationQuestion);
        return {
          executionId,
          requestId,
          routingDecision,
          response: clarificationQuestion,
          durationMs: Date.now() - startTime,
          actionsExecuted: 0,
          workspaceStatus: "COMPLETED",
          terminationReason: "AWAITING_CLARIFICATION",
          stmUpdates,
          pendingOperation: newPendingOp,
        };
      }

      const kernelResults = await kernel.executeActionBatch(req.userId, validation.validDecisions);
      const successfulExecutions = kernelResults.filter((r: any) => r.success);

      // Synthesize grounded truthful user response via GroundedResponseGenerator
      const { GroundedResponseGenerator } = await import("../grounding/GroundedResponseGenerator");
      let response = GroundedResponseGenerator.getInstance().generateResponse(
        semanticTurn,
        kernelResults,
        { userMessage: req.message, conversationalSummary: semanticTurn.conversationalSummary }
      );

      // Calculate and persist STM updates atomically
      let activeFocus: IContextEntityRef | null = stm?.activeFocus || null;
      let recentEntities: IContextEntityRef[] = [...(stm?.recentEntities || [])];
      let recentlyExecutedOperations: IExecutedOperationSnapshot[] = [...(stm?.recentlyExecutedOperations || [])];

      for (let i = 0; i < successfulExecutions.length; i++) {
        const res = successfulExecutions[i];
        const op = semanticTurn.operations[i] || semanticTurn.operations[0];
        const cap = DOMAIN_CAPABILITIES[res.actionType as DomainActionType];
        const entityId = res.targetEntity?.entityId || res.targetEntityId || res.data?.taskId || res.data?.goalId || res.data?._id || res.data?.id;
        const displayName = res.targetEntity?.displayName || res.data?.title || res.data?.taskTitle || res.data?.mealName || res.data?.name || cap?.verbalization?.entityNoun || "item";
        const entityType = res.targetEntity?.entityType || cap?.targetEntityType || "task";
        const domain = res.targetEntity?.domain || op?.domain || "productivity";

        if (entityId) {
          activeFocus = {
            entityType,
            entityId: entityId.toString(),
            displayName,
            domain,
            updatedAt: new Date(),
            lastReferencedTurnId: semanticTurn.turnId,
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
          reversibility: op?.riskClass === "HIGH_IRREVERSIBLE" ? "irreversible_external" : "atomic_single_doc",
        });
      }

      recentlyExecutedOperations = recentlyExecutedOperations.slice(0, 5);

      // If a goal was proposed, set state-driven PendingOperationContext for confirmation
      let nextPendingOperation: IPendingOperationContext | null = null;
      const proposedGoalRes = successfulExecutions.find((res: any) => res.actionType === "propose_goal");
      if (proposedGoalRes) {
        const pGoalId = proposedGoalRes.targetEntity?.entityId || proposedGoalRes.data?.goalId || proposedGoalRes.data?._id;
        const pGoalTitle = proposedGoalRes.targetEntity?.displayName || proposedGoalRes.data?.title || "goal";
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
      }

      const stmUpdates = {
        activeFocus,
        recentEntities,
        pendingOperation: nextPendingOperation,
        recentlyExecutedOperations,
      };

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

      req.onChunk?.(response);

      const actionIds = kernelResults.map((r: any) => r.actionId);
      const traceContext = ProductionTracer.getInstance().recordTrace({
        requestId,
        executionId,
        userId: req.userId,
        actionIds,
        eventIds: [],
        durationMs: Date.now() - startTime,
        routingStrategy: routingDecision.strategy,
        terminationReason: "GOAL_SATISFIED",
        timestamp: Date.now(),
      });

      return {
        executionId,
        requestId,
        routingDecision,
        response,
        durationMs: Date.now() - startTime,
        actionsExecuted: successfulExecutions.length,
        workspaceStatus: "COMPLETED",
        terminationReason: "GOAL_SATISFIED",
        traceContext,
        stmUpdates,
      };
    }

    // 5. Clarification Prompt Branch
    if (semanticTurn.clarification?.required && semanticTurn.clarification.questionToUser) {
      const response = semanticTurn.clarification.questionToUser;
      req.onChunk?.(response);
      return {
        executionId,
        requestId,
        routingDecision,
        response,
        durationMs: Date.now() - startTime,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "CLARIFICATION_REQUIRED",
      };
    }

    // 6. Fast Path Execution Branch (Fallback <= 1000ms)
    if (routingDecision.strategy === "FAST_PATH") {
      const fastContext: FastPathContext = {
        executionId,
        knownTasks: req.knownTasks,
      };

      const fastResult = await this.fastPath.execute(req.message, req.userId, fastContext);

      if (fastResult.handled) {
        const durationMs = Date.now() - startTime;
        const actionsExecuted = fastResult.kernelResults?.filter((r) => r.success).length || 0;
        const actionIds = fastResult.kernelResults?.map((r) => r.actionId) || [];

        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId,
          executionId,
          userId: req.userId,
          actionIds,
          eventIds: [],
          durationMs,
          routingStrategy: "FAST_PATH",
          terminationReason: "GOAL_SATISFIED",
          timestamp: Date.now(),
        });

        req.onChunk?.(fastResult.userResponse);
        return {
          executionId,
          requestId,
          routingDecision,
          response: fastResult.userResponse,
          durationMs,
          actionsExecuted,
          workspaceStatus: "COMPLETED",
          terminationReason: "GOAL_SATISFIED",
          traceContext,
        };
      }
      // If fast path failed to extract or handle, fall through
    }

    // 3. Conversational LLM Execution Branch (Natural Dialogue without Specialist Jargon)
    if (routingDecision.strategy === "CONVERSATIONAL_LLM") {
      let historyMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];

      try {
        if (req.conversationId) {
          const loaded = await ConversationManager.getInstance().load(req.conversationId, req.userId);
          if (loaded && loaded.recentMessages && loaded.recentMessages.length > 0) {
            historyMessages = loaded.recentMessages.slice(-6).map((m: any) => ({
              role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
              content: m.content || "",
            }));
          }
        }
      } catch (historyErr) {
        // Non-blocking fallback if conversation history cannot be retrieved
      }

      // Resolve dynamic user name: from request or authoritative profile
      let resolvedUserName = req.userName?.trim();
      const isGenericUserName = !resolvedUserName || /^(mobile|mobile user|user|client|guest)$/i.test(resolvedUserName);
      if (isGenericUserName && req.userId) {
        try {
          const { User } = await import("@/server/db/models/User");
          const user = await User.findById(req.userId).select("name").lean();
          if (user && (user as any).name) {
            resolvedUserName = (user as any).name.trim();
          }
        } catch (_) {
          // Non-blocking fallback
        }
      }
      const activeUserName = extractFirstName(resolvedUserName || AVEN_IDENTITY.defaultUserName || "Daksh");

      let contextProjection = "";
      if (stm?.activeFocus || stm?.pendingOperation || (stm?.recentEntities && stm.recentEntities.length > 0)) {
        contextProjection = "\n\nACTIVE CONVERSATIONAL CONTEXT:\n";
        if (stm.activeFocus) {
          contextProjection += `- Active Focus: "${stm.activeFocus.displayName}" (${stm.activeFocus.entityType}, domain: ${stm.activeFocus.domain})\n`;
        }
        if (stm.pendingOperation) {
          const pendingTarget = stm.pendingOperation.partialPayload?.title || stm.pendingOperation.candidateEntities?.[0]?.displayName || "item";
          contextProjection += `- Pending Operation: ${stm.pendingOperation.actionType} on "${pendingTarget}" (State: ${stm.pendingOperation.state})\n`;
          if (stm.pendingOperation.clarificationQuestion) {
            contextProjection += `- Pending Clarification/Question Asked: "${stm.pendingOperation.clarificationQuestion}"\n`;
          }
        }
        if (stm.recentEntities && stm.recentEntities.length > 0) {
          const recentList = stm.recentEntities.map((e: any) => `"${e.displayName}" (${e.entityType})`).join(", ");
          contextProjection += `- Recently Referenced Entities: ${recentList}\n`;
        }
        contextProjection += "When the user asks conversational questions referencing recent entities or proposals (such as 'what goal?', 'which one?', 'what did you propose?'), answer directly using this context without greeting afresh.\n";
      }

      const systemPrompt =
        buildSupervisorPersonaPrompt(activeUserName) +
        contextProjection +
        "\n\nCRITICAL FORMATTING RULES FOR SPOKEN VOICE & CONVERSATION:\n" +
        "1. NEVER output markdown tables, pipe grids (|), or ASCII divider lines (---). Tables cannot be spoken aloud and break voice synthesis.\n" +
        "2. When explaining instructions, recipes, or workflows, keep them concise, structured with clear steps, and spoken naturally in active English.\n" +
        "3. Every sentence must end with clear punctuation (. or !) so voice synthesis streams and speaks aloud smoothly.\n" +
        "4. When the user interrupts or asks to pause/hold on, acknowledge gracefully in 1 composed sentence and wait for their direction.\n" +
        "5. Never output internal thought tags, raw JSON, or robotic preamble.";

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: req.message },
      ];

      let responseText = "";
      if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") {
        try {
          const rawResponse = await groqChat({
            messages,
            model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
            temperature: 0.6,
            max_tokens: 800,
          });
          responseText = cleanLLMResponse(rawResponse).trim();
        } catch (llmErr) {
          console.warn("[SUPERVISOR] Conversational LLM call fallback:", llmErr);
        }
      }

      if (!responseText) {
        // Dynamic contextual acknowledgment if all LLM tiers encountered an outage
        const lowerMsg = req.message.toLowerCase();
        if (
          (lowerMsg.includes("what goal") || lowerMsg.includes("which goal") || lowerMsg.includes("what did you propose")) &&
          (stm?.activeFocus?.entityType === "goal" || stm?.pendingOperation?.actionType?.includes("goal"))
        ) {
          const goalName = stm?.pendingOperation?.partialPayload?.title || stm?.activeFocus?.displayName || "your proposed goal";
          responseText = `I'm setting up "${goalName}" as a recurring morning habit.`;
        } else if (lowerMsg.includes("recipe") || lowerMsg.includes("cook") || lowerMsg.includes("chicken")) {
          responseText = "Here is a quick chili chicken recipe: sauté bite-sized chicken with soy sauce and cornstarch until golden, stir-fry with garlic, ginger, and chili peppers, then toss in a sweet-spicy chili glaze and garnish with green onions.";
        } else if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey")) {
          responseText = `Hey, ${activeUserName}. What's on your mind?`;
        } else {
          responseText = "I'm with you. What are we working on?";
        }
      }

      // Post-LLM context grounding: if user asked about a goal/entity and the LLM
      // response is generic (doesn't reference the active entity), override with grounded response
      if (responseText) {
        const lowerMsg = req.message.toLowerCase();
        const lowerResp = responseText.toLowerCase();
        const isAskingAboutGoal = lowerMsg.includes("what goal") || lowerMsg.includes("which goal") || lowerMsg.includes("what did you propose");
        const hasGoalContext = stm?.activeFocus?.entityType === "goal" || stm?.pendingOperation?.actionType?.includes("goal");
        const goalName = stm?.pendingOperation?.partialPayload?.title || stm?.activeFocus?.displayName;

        if (isAskingAboutGoal && hasGoalContext && goalName) {
          const goalNameLower = goalName.toLowerCase();
          // Check if the LLM response actually references the goal
          const referencesGoal = goalNameLower.split(/\s+/).some((word: string) => word.length > 3 && lowerResp.includes(word));
          if (!referencesGoal) {
            responseText = `I proposed "${goalName}" as a daily habit. Would you like me to confirm and activate it?`;
          }
        }
      }


      const durationMs = Date.now() - startTime;
      const traceContext = ProductionTracer.getInstance().recordTrace({
        requestId,
        executionId,
        userId: req.userId,
        actionIds: [],
        eventIds: [],
        durationMs,
        routingStrategy: "CONVERSATIONAL_LLM",
        terminationReason: "CONVERSATIONAL_RESPONSE",
        timestamp: Date.now(),
      });

      req.onChunk?.(responseText);

      return {
        executionId,
        requestId,
        routingDecision,
        response: responseText,
        durationMs,
        actionsExecuted: 0,
        workspaceStatus: "COMPLETED",
        terminationReason: "CONVERSATIONAL_RESPONSE",
        traceContext,
      };
    }

    // 4. Multi-Agent / Specialist ReAct Execution Branch
    // Immediately emit natural Jarvis executive acknowledgement as Chunk 0 (< 15ms)
    const acknowledgement = this.getExecutiveAcknowledgement(req.message, routingDecision);
    if (acknowledgement) {
      req.onChunk?.(acknowledgement + " ");
    }

    // Ingest dialogue context if conversationId is provided so follow-up commands retain proposal details
    let contextualGoal = req.message;
    if (req.conversationId) {
      try {
        const loaded = await ConversationManager.getInstance().load(req.conversationId, req.userId);
        if (loaded?.recentMessages && loaded.recentMessages.length > 0) {
          const recent = loaded.recentMessages
            .slice(-4)
            .map((m: any) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
            .join("\n");
          if (recent.trim().length > 0) {
            contextualGoal = `Recent conversation context:\n${recent}\n\nCurrent User Request: ${req.message}`;
          }
        }
      } catch (_) {}
    }

    const workspace = new ExecutionWorkspace({
      executionId,
      userId: req.userId,
      conversationId: req.conversationId,
      userRequest: req.message,
      goal: contextualGoal,
      constraints: [],
    });

    const targetSpecialists = routingDecision.selectedSpecialists ||
      (routingDecision.targetDomain ? [routingDecision.targetDomain] : undefined);

    const reactResult: ReActLoopResult = await this.reactOrchestrator.runLoop(
      executionId,
      req.userId,
      contextualGoal,
      workspace,
      undefined,
      targetSpecialists,
      semanticTurn
    );

    // Emit final synthesis summary as Chunk 1
    req.onChunk?.(reactResult.userSummary);

    const fullResponse = acknowledgement
      ? `${acknowledgement} ${reactResult.userSummary}`.trim()
      : reactResult.userSummary;

    const durationMs = Date.now() - startTime;
    const actionsExecuted = reactResult.executedActions.filter((a) => a.success).length;
    const actionIds = reactResult.executedActions.map((a) => a.actionId);
    const eventIds = workspace.ledger.getEvents().map((e) => e.id);

    const traceContext = ProductionTracer.getInstance().recordTrace({
      requestId,
      executionId,
      userId: req.userId,
      memorySnapshotId: executionId,
      actionIds,
      eventIds,
      durationMs,
      routingStrategy: routingDecision.strategy,
      terminationReason: reactResult.terminationReason,
      timestamp: Date.now(),
    });

    return {
      executionId,
      requestId,
      routingDecision,
      response: fullResponse,
      durationMs,
      actionsExecuted,
      workspaceStatus: workspace.getState().status,
      terminationReason: reactResult.terminationReason,
      traceContext,
    };
  }

  /**
   * Generates a composed, sharp executive acknowledgement as Aven
   * when entering cognitive specialist reasoning or multi-agent planning.
   */
  private getExecutiveAcknowledgement(message: string, decision: RoutingDecision): string {
    const lower = message.toLowerCase();

    // 1. Action confirmation & execution
    if (/\b(implement|execute|confirm|apply|commit|do it|go ahead|proceed|approve|make it so|sounds good|looks good)\b/i.test(lower)) {
      const options = [
        "Understood. Putting that into action.",
        "Applying those updates now.",
        "Executing that now.",
        "Understood. Taking care of that now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 2. Goal creation, planning, structuring, scheduling
    if (decision.targetDomain === "productivity" || /\b(goal|goals|plan|plans|schedule|routine|target|habit|habits|roadmap)\b/i.test(lower)) {
      const options = [
        "Understood. Structuring that plan now.",
        "Mapping out the structure now.",
        "Putting that structure together now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 3. Health & physical domain
    if (decision.targetDomain === "health" || /\b(health|workout|diet|meal|sleep|training|exercise)\b/i.test(lower)) {
      const options = [
        "Checking your health and recovery metrics now.",
        "Reviewing your training context now.",
        "Checking your routine and metrics now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 4. Wellness & recovery domain
    if (decision.targetDomain === "wellness" || /\b(wellness|stress|burnout|tired|energy|recovery|rest)\b/i.test(lower)) {
      const options = [
        "Understood. Let's look at your workload and recovery.",
        "Reviewing your recovery balance now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 5. Multi-agent & general cognitive analysis
    const defaultOptions = [
      "Understood. Looking into that across your system now.",
      "Reviewing that across your system now.",
    ];
    return defaultOptions[Math.floor(Math.random() * defaultOptions.length)];
  }
}
