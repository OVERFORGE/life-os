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
import mongoose from "mongoose";
import { AvenStreamEvent } from "../contracts/AvenStreamContracts";
import { CapabilityPresentationRegistry } from "../external/presentation/CapabilityPresentationRegistry";
import { WorldModelBridge } from "../../worldv2/WorldModelBridge";
import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";

export interface SupervisorRequest {
  userId: string;
  userName?: string;
  message: string;
  conversationId?: string;
  requestId?: string;
  knownTasks?: Array<{ id: string; title: string }>;
  onChunk?: (chunk: string) => void;
  onEvent?: (event: AvenStreamEvent) => void;
  surfaceContext?: {
    activeExecutionTitle?: string;
    activeExecutionCategory?: string;
    currentInteractionMode?: string;
    sourceSurface?: string;
  };
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
  lifeContext?: ILifeContextProjection;
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

    req.onEvent?.({
      type: "status",
      status: "understanding",
      message: "Understanding your request...",
    });

    let earlyFillerEmitted = false;
    let mainExecutionFinished = false;

    // 0a. Deterministic High-Velocity Fast Path Execution (< 1000ms latency budget)
    if (this.fastPath.canHandle(req.message)) {
      const fastContext: FastPathContext = {
        executionId,
        knownTasks: req.knownTasks,
      };

      const fastResult = await this.fastPath.execute(req.message, req.userId, fastContext);

      if (fastResult.handled) {
        const durationMs = Date.now() - startTime;
        const actionsExecuted = fastResult.kernelResults?.filter((r) => r.success).length || 0;
        const actionIds = fastResult.kernelResults?.map((r) => r.actionId) || [];
        const routingDecision: RoutingDecision = {
          strategy: "FAST_PATH",
          confidence: 1.0,
          rationale: "Deterministic high-velocity intent matching Fast Path criteria",
        };

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

        mainExecutionFinished = true;
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
    }

    // Launch instant model-driven semantic filler concurrently (< 180ms) for real-time voice responsiveness
    const fillerPromise = req.onChunk
      ? FastSemanticFiller.getInstance()
          .generateFiller(req.message)
          .then((filler) => {
            if (filler && !mainExecutionFinished && req.onChunk) {
              earlyFillerEmitted = true;
              const cleanFiller = filler.replace(/[.!?\s]+$/, "") + ".\n\n";
              req.onChunk(cleanFiller);
              return filler;
            }
            return null;
          })
          .catch(() => null)
      : Promise.resolve(null);

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
    }

    // Ingest authoritative LifeContextProjection from WorldModelBridge (Phase 1)
    const bridge = WorldModelBridge.getInstance();
    const lifeContext = await bridge.getProjection(req.userId);

    // 1. Authoritative Semantic Interpretation via Aven with Bounded Context Projection
    const interpreter = SemanticIntentInterpreter.getInstance();
    const semanticTurn = await interpreter.interpret(req.message, {
      userId: req.userId,
      conversationId,
      knownTasks: req.knownTasks,
      recentHistory: (loadedState?.recentMessages || []).slice(-16),
      activeFocus: stm?.activeFocus || null,
      recentEntities: stm?.recentEntities || [],
      pendingOperation: pendingOp,
      activeMode: stm?.activeContextMode || "standard",
      activeIncidents: stm?.activeIncidents || [],
      serializedLifeContext: lifeContext.systemPromptContextSummary,
      lifeContextProjection: lifeContext,
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
          mainExecutionFinished = true;
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

      mainExecutionFinished = true;
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
      mainExecutionFinished = true;
      req.onChunk?.(response);

      const op = semanticTurn.operations[0];
      const opPayload = { ...(op?.payload || {}) };
      if (op?.payload?.priority) {
        opPayload.priority = op.payload.priority;
      }

      const isTemporalClarification =
        op?.actionType === "create_temporal_series" ||
        op?.actionType === "schedule_occurrence" ||
        response.toLowerCase().includes("class") ||
        response.toLowerCase().includes("schedule") ||
        response.toLowerCase().includes("block") ||
        response.toLowerCase().includes("routine");

      const resolvedActionType = op?.actionType || (isTemporalClarification ? "create_temporal_series" : "create_task");

      const newPendingOp: IPendingOperationContext = {
        operationId: op?.operationId || generateId("pop"),
        turnId: semanticTurn.turnId,
        actionType: resolvedActionType,
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
      // If early concurrent filler has not emitted, check if filler is needed
      if (!earlyFillerEmitted) {
        try {
          const fastFiller = await Promise.race([
            fillerPromise,
            new Promise<null>((res) => setTimeout(() => res(null), 80)),
          ]);
          if (!earlyFillerEmitted && !fastFiller) {
            const filler = this.getSemanticFiller(semanticTurn);
            if (filler) {
              const cleanFiller = filler.replace(/[.!?\s]+$/, "") + ".\n\n";
              req.onChunk?.(cleanFiller);
            }
          }
        } catch (_) {}
      }

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

      // Check for external capability requirements and provider connections
      let missingProviderInfo: { providerId: string; providerDisplayName: string; capabilityURN: string } | null = null;
      for (const op of semanticTurn.operations) {
        let reqProviderId: string | null = null;
        let capURN: string = op.capabilityURN || "";

        if (op.actionType === "external_capability_action") {
          reqProviderId = op.payload?.providerId || op.providerHint || null;
          capURN = op.payload?.capabilityURN || op.capabilityURN || "";
        } else if (op.providerHint) {
          reqProviderId = op.providerHint;
        } else if (op.capabilityURN) {
          if (op.capabilityURN.startsWith("productivity.calendar")) reqProviderId = "google_calendar";
          else if (op.capabilityURN.startsWith("wellness.media")) reqProviderId = "spotify";
          else if (op.capabilityURN.startsWith("productivity.git")) reqProviderId = "github";
          else if (op.capabilityURN.startsWith("productivity.email")) reqProviderId = "gmail";
          else if (op.capabilityURN.startsWith("productivity.contacts")) reqProviderId = "google_contacts";
          else if (op.capabilityURN.startsWith("productivity.task")) reqProviderId = "google_tasks";
          else if (op.capabilityURN.startsWith("health.")) reqProviderId = "google_fit";
        }

        if (reqProviderId) {
          const connCheck = await this.checkProviderConnection(req.userId, reqProviderId);
          if (!connCheck.connected) {
            missingProviderInfo = {
              providerId: reqProviderId,
              providerDisplayName: connCheck.providerDisplayName,
              capabilityURN: capURN || `productivity.${reqProviderId}`,
            };
            break;
          }
        }
      }

      if (missingProviderInfo) {
        const pName = missingProviderInfo.providerDisplayName;
        const connectMsg = missingProviderInfo.providerId === "spotify"
          ? `I can do that once ${pName} is connected.`
          : `I can handle that, but ${pName} isn't connected yet.`;

        req.onEvent?.({
          type: "missing_connection",
          providerId: missingProviderInfo.providerId,
          providerDisplayName: pName,
          capabilityURN: missingProviderInfo.capabilityURN,
          message: connectMsg,
          connectUrl: "/settings/connections",
        });

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

        mainExecutionFinished = true;
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
          terminationReason: "MISSING_CONNECTION",
          stmUpdates,
          pendingOperation: newPendingOp,
        };
      }

      // HITL Confirmation Check (Human-In-The-Loop Security Gate per Claude Desktop / MCP standards)
      // Enforces explicit user permission for sensitive filesystem scopes (e.g. root drives D:\, C:\) or write/mutation operations
      const sessionAuthorizedScopes: string[] = [...((stm as any)?.authorizedScopes || [])];
      const userConfirmedPending =
        pendingOp &&
        (pendingOp as any).state === "AWAITING_CONFIRMATION" &&
        (semanticTurn.primaryClassification === "CONFIRMATION" ||
         semanticTurn.primaryClassification === "CLARIFICATION_RESPONSE" ||
         /^(?:yes|yep|yeah|sure|confirm|proceed|ok|okay|allow|do it|send it|go ahead)/i.test((req.message || "").trim()) ||
         (semanticTurn.operations.length > 0 &&
          Boolean((semanticTurn.operations[0] as any).confirmationGranted || semanticTurn.operations[0].executionEligibility === "READY")));

      if (userConfirmedPending) {
        if (semanticTurn.operations.length === 0 && pendingOp) {
          const restoredPayload = { ...(pendingOp.partialPayload || {}) };
          const capURN = restoredPayload.capabilityURN || (restoredPayload as any)?.parameters?.capabilityURN || (pendingOp as any).capabilityURN;
          const providerId = restoredPayload.providerId || (restoredPayload as any)?.parameters?.providerId || (pendingOp as any).providerHint;
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
          if (p && !sessionAuthorizedScopes.includes(p)) {
            sessionAuthorizedScopes.push(p);
          }
          semanticTurn.operations.push(restoredOp);
        } else {
          for (const op of semanticTurn.operations) {
            (op as any).confirmationGranted = true;
            const p = String(op.payload?.parameters?.path || op.payload?.path || pendingOp?.partialPayload?.parameters?.path || pendingOp?.partialPayload?.path || "").trim();
            if (p && !sessionAuthorizedScopes.includes(p)) {
              sessionAuthorizedScopes.push(p);
            }
          }
        }
      }

      let hitlRequiredOp: any = null;
      for (const op of semanticTurn.operations) {
        if ((op as any).confirmationGranted) continue;

        const isExplicitConf =
          (op as any).requiresConfirmation === true ||
          (op as any).confirmationMode === "EXPLICIT_CONFIRMATION" ||
          op.riskClass === "HIGH_IRREVERSIBLE";

        const capURN = (op as any).capabilityURN || op.payload?.capabilityURN || "";
        const reqPath = String(op.payload?.parameters?.path || op.payload?.path || "").trim();

        // If path has already been authorized for this conversation session or was executed in recent turns, skip confirmation prompt
        const wasRecentlyExecuted = (stm?.recentlyExecutedOperations || []).some((recentOp: any) => {
          const recentPath = String(recentOp.payloadSnapshot?.parameters?.path || recentOp.payloadSnapshot?.path || "").trim();
          return recentPath && reqPath.toLowerCase().startsWith(recentPath.toLowerCase());
        });

        if (reqPath && (sessionAuthorizedScopes.some((s) => reqPath.toLowerCase().startsWith(s.toLowerCase())) || wasRecentlyExecuted)) {
          continue;
        }

        // HITL Policy: Read operations and safe drafts do NOT require HITL. Only irreversible WRITE/MUTATION operations require HITL!
        const isReadOperation =
          capURN.includes("storage.list_files") ||
          capURN.includes("storage.read_file") ||
          capURN.includes("calendar.read_events") ||
          capURN.includes("email.search_messages") ||
          capURN.includes("email.read_thread") ||
          capURN.includes("email.read_message") ||
          capURN.includes("email.create_draft") ||
          capURN.includes("contacts.search_contacts") ||
          capURN.includes("contacts.get_contact") ||
          capURN.includes("task.sync_tasks") ||
          capURN.includes("biometrics.read") ||
          capURN.includes("activity.sync_telemetry") ||
          capURN.includes("activity.read_daily_summary") ||
          capURN.includes("activity.read_sleep") ||
          capURN.includes("git.list_prs") ||
          capURN.includes("git.list_repos") ||
          capURN.includes("git.search_code") ||
          capURN.includes("media.read_current_track") ||
          capURN.includes("context.system.search_web") ||
          capURN.includes("context.system.open_url") ||
          capURN.includes("context.system.read_clipboard");

        const isWriteMutation =
          !isReadOperation &&
          (capURN.includes("write_file") ||
           capURN.includes("delete") ||
           capURN.includes("email.send_message") ||
           capURN.includes("calendar.create_event") ||
           capURN.includes("calendar.update_event") ||
           capURN.includes("calendar.delete_event") ||
           capURN.includes("task.create_external") ||
           capURN.includes("git.create_issue") ||
           capURN.includes("activity.record_workout") ||
           op.actionType === "delete_task" ||
           op.actionType === "delete_goal" ||
           (isExplicitConf && !isReadOperation));

        if (isWriteMutation) {
          hitlRequiredOp = op;
          break;
        }
      }

      if (hitlRequiredOp) {
        const op = hitlRequiredOp;
        const capURN = op.capabilityURN || op.payload?.capabilityURN || "";
        const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any) || {
          displayName: "External Service",
          providerDisplayName: "System",
          iconName: "Shield",
        };

        const targetPath = String(op.payload?.parameters?.path || op.payload?.path || "").trim();
        const isWriteFile = capURN.includes("write_file");
        const isDelete = capURN.includes("delete");
        const isEmailSend = capURN.includes("email.send_message");
        const isCalendarCreate = capURN.includes("calendar.create_event");
        const isGitIssue = capURN.includes("git.create_issue");
        const isWorkout = capURN.includes("activity.record_workout");

        let verbalPrompt = `I'll need your permission to perform this action. Would you like me to proceed?`;
        let confirmTitle = `Confirm Action?`;
        let confirmMessage = `Aven requires your approval to proceed.`;
        let actionLabel = "Write Operation";

        if (isWriteFile) {
          const fileName = require("path").basename(targetPath) || "file";
          verbalPrompt = `I'll need your permission to create ${fileName}. Would you like me to proceed?`;
          confirmTitle = `Allow Creating ${fileName}?`;
          confirmMessage = `Aven requires your approval to write and save ${targetPath || fileName}.`;
          actionLabel = "Create File";
        } else if (isDelete) {
          const fileName = targetPath ? require("path").basename(targetPath) : (op.payload?.title || "item");
          verbalPrompt = `I'll need your permission to delete ${fileName}. Would you like me to proceed?`;
          confirmTitle = `Allow Deleting ${fileName}?`;
          confirmMessage = `Aven requires your approval to delete ${fileName}.`;
          actionLabel = "Delete Item";
        } else if (isEmailSend) {
          const rawTo = op.payload?.parameters?.to;
          const toList = Array.isArray(rawTo) ? rawTo.filter(Boolean).join(", ") : (rawTo || "");
          const to = toList.trim() || "the recipient";
          verbalPrompt = `I'll need your permission to send an email to ${to}. Would you like me to proceed?`;
          confirmTitle = `Confirm Sending Email?`;
          confirmMessage = `Aven requires your approval to send email to ${to}.`;
          actionLabel = "Send Email";
        } else if (isCalendarCreate) {
          const title = op.payload?.parameters?.title || "event";
          verbalPrompt = `I'll need your permission to schedule "${title}" on your calendar. Would you like me to proceed?`;
          confirmTitle = `Confirm Calendar Event?`;
          confirmMessage = `Aven requires your approval to schedule "${title}".`;
          actionLabel = "Schedule Event";
        } else if (isGitIssue) {
          const title = op.payload?.parameters?.title || "issue";
          verbalPrompt = `I'll need your permission to create issue "${title}" on GitHub. Would you like me to proceed?`;
          confirmTitle = `Create GitHub Issue?`;
          confirmMessage = `Aven requires your approval to open issue "${title}".`;
          actionLabel = "Create Issue";
        } else if (isWorkout) {
          const wType = op.payload?.parameters?.workoutType || "workout";
          verbalPrompt = `I'll need your permission to log this ${wType} in Google Fit. Would you like me to proceed?`;
          confirmTitle = `Log Workout?`;
          confirmMessage = `Aven requires your approval to record this ${wType}.`;
          actionLabel = "Record Workout";
        }

        const newPendingOp: IPendingOperationContext = {
          operationId: op.operationId || generateId("pop"),
          turnId: semanticTurn.turnId,
          actionType: op.actionType,
          domain: op.domain,
          partialPayload: op.payload,
          missingRequirement: {
            kind: "CONFIRMATION" as any,
            targetEntityType: "storage" as any,
          },
          clarificationQuestion: verbalPrompt,
          state: "AWAITING_CONFIRMATION" as any,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        };

        req.onEvent?.({
          type: "status",
          status: "waiting_for_confirmation",
          message: "Awaiting permission...",
        });

        req.onEvent?.({
          type: "confirmation_required",
          actionId: newPendingOp.operationId,
          capabilityURN: capURN,
          providerDisplayName: pres.providerDisplayName,
          title: confirmTitle,
          message: confirmMessage,
          details: {
            Target: targetPath || (op.payload?.title || pres.displayName),
            Action: actionLabel,
            Security: "Human-in-the-Loop Required",
          },
          confirmLabel: "Allow",
          cancelLabel: "Deny",
        });

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

        mainExecutionFinished = true;
        req.onChunk?.(verbalPrompt);
        req.onEvent?.({ type: "assistant_delta", text: verbalPrompt });

        return {
          executionId,
          requestId,
          routingDecision,
          response: verbalPrompt,
          durationMs: Date.now() - startTime,
          actionsExecuted: 0,
          workspaceStatus: "COMPLETED",
          terminationReason: "AWAITING_CONFIRMATION",
          stmUpdates,
          pendingOperation: newPendingOp,
        };
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

        mainExecutionFinished = true;
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

      req.onEvent?.({ type: "status", status: "executing", message: "Executing..." });
      for (const op of semanticTurn.operations) {
        const capURN = op.capabilityURN || (op.actionType === "external_capability_action" ? (op.payload?.capabilityURN as any) : undefined);
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
          humanMessage: rej.error || pres.failedPhrase || "Validation failed",
          state: "failed",
          error: rej.error,
        });
      }

      const kernelResults = await kernel.executeActionBatch(req.userId, validation.validDecisions);
      const allExecutionResults = [...kernelResults, ...rejectedResults];
      const successfulExecutions = allExecutionResults.filter((r: any) => r.success);

      for (let i = 0; i < kernelResults.length; i++) {
        const res = kernelResults[i];
        const op = semanticTurn.operations[i] || semanticTurn.operations[0];
        const capURN = op.capabilityURN || (op.actionType === "external_capability_action" ? (op.payload?.capabilityURN as any) : undefined);
        if (capURN) {
          const reqProvId = op.providerHint || op.payload?.providerId;
          const pres = CapabilityPresentationRegistry.getInstance().get(capURN as any, reqProvId);
          const resData = res.data || res.result || {};
          let humanMessage = res.success ? pres.completedPhrase : (res.error?.message || pres.failedPhrase);

          if (res.success && (capURN.includes("playback") || capURN.includes("spotify"))) {
            if (resData.nowPlaying) {
              humanMessage = resData.isPlaying ? `Playing "${resData.nowPlaying}"` : `Paused "${resData.nowPlaying}"`;
            } else if (resData.command === "pause" || resData.isPlaying === false) {
              humanMessage = "Playback paused";
            } else if (resData.command === "resume") {
              humanMessage = "Playback resumed";
            } else if (resData.command === "next" || resData.command === "skip") {
              humanMessage = "Skipped to next track";
            }
          } else if (res.success && capURN.includes("storage.list_files")) {
            const count = resData.totalCount ?? (resData.files?.length || 0);
            const ext = resData.extension ? ` ${resData.extension}` : "";
            const dir = String(resData.searchDirectory || op.payload?.parameters?.path || "").trim();
            let loc = "on desktop";
            if (reqProvId === "google_drive" || dir === "Google Drive") {
              loc = "in Google Drive";
            } else if (reqProvId === "obsidian_vault" || dir.toLowerCase().includes("obsidian")) {
              loc = "in Obsidian vault";
            } else if (reqProvId === "notion" || dir.toLowerCase().includes("notion")) {
              loc = "in Notion workspace";
            } else if (dir.startsWith("D:") || dir.startsWith("d:") || dir.toLowerCase().includes("d drive")) {
              loc = "on D drive";
            } else if (dir.startsWith("C:") || dir.startsWith("c:") || dir.toLowerCase().includes("c drive")) {
              loc = "on C drive";
            } else if (dir.toLowerCase() === "downloads") {
              loc = "in Downloads";
            } else if (dir.toLowerCase() === "documents") {
              loc = "in Documents";
            }
            const reqT = String(op.payload?.parameters?.type || "").toLowerCase();
            const n = reqT.includes("folder") ? "folder" : "file";
            humanMessage = count === 0 ? `No${ext} ${n}s found ${loc}` : `Found ${count}${ext} ${n}${count === 1 ? "" : "s"} ${loc}`;
          } else if (res.success && capURN.includes("git.list_repos")) {
            const count = resData.repositories?.length || 0;
            humanMessage = count === 0 ? "No repositories found on GitHub" : `Found ${count} GitHub repositor${count === 1 ? "y" : "ies"}`;
          } else if (res.success && capURN.includes("git.list_prs")) {
            const count = resData.pullRequests?.length || 0;
            humanMessage = count === 0 ? "No open pull requests" : `Found ${count} open pull request${count === 1 ? "" : "s"}`;
          } else if (res.success && capURN.includes("open_url")) {
            humanMessage = `Opened in browser`;
          }

          req.onEvent?.({
            type: "tool_activity",
            providerId: reqProvId || pres.providerDisplayName.toLowerCase().replace(/\s+/g, "_"),
            providerDisplayName: pres.providerDisplayName,
            capabilityURN: capURN,
            iconName: pres.iconName,
            humanMessage,
            state: res.success ? "completed" : "failed",
            error: res.success ? undefined : (res.error?.message || "Execution failed"),
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

      // Synthesize grounded truthful user response via GroundedResponseGenerator
      const { GroundedResponseGenerator } = await import("../grounding/GroundedResponseGenerator");
      let response = GroundedResponseGenerator.getInstance().generateResponse(
        semanticTurn,
        allExecutionResults,
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
        let entityId = res.targetEntity?.entityId || res.targetEntityId || res.data?.taskId || res.data?.goalId || res.data?._id || res.data?.id;
        let displayName = res.targetEntity?.displayName || res.data?.title || res.data?.taskTitle || res.data?.mealName || res.data?.name;
        let entityType: any = res.targetEntity?.entityType || cap?.targetEntityType || "task";
        const domain = res.targetEntity?.domain || op?.domain || "productivity";

        if (res.actionType === "external_capability_action") {
          const capURN = op?.capabilityURN || (op?.payload?.capabilityURN as string) || "";
          if (capURN.includes("storage.read_file") || capURN.includes("storage.write_file")) {
            entityType = "file";
            displayName = res.data?.fileName || (res.data?.path ? require("path").basename(res.data.path) : undefined) || displayName || "file";
            entityId = res.data?.fileName || res.data?.path || displayName;
          } else if (capURN.includes("email.read_message") || capURN.includes("email.read_thread")) {
            entityType = "email";
            displayName = res.data?.subject || displayName || "email";
            entityId = res.data?.id || res.data?.threadId || entityId || displayName;
          } else if (capURN.includes("email.search_messages")) {
            entityType = "email";
            const firstMsg = res.data?.messages?.[0];
            if (firstMsg) {
              displayName = firstMsg.subject || firstMsg.from || "email";
              entityId = firstMsg.id || "email_message";
            }
            if (res.data?.messages && Array.isArray(res.data.messages)) {
              for (const m of res.data.messages.slice(0, 5)) {
                if (m.id && !recentEntities.some((e) => e.entityId === m.id)) {
                  recentEntities.push({
                    entityType: "email",
                    entityId: m.id,
                    displayName: `${m.subject} (from ${m.from})`,
                    domain: "productivity",
                    updatedAt: new Date(),
                    lastReferencedTurnId: semanticTurn.turnId,
                  });
                }
              }
            }
          } else if (capURN.includes("contacts")) {
            entityType = "contact";
            const firstContact = res.data?.contacts?.[0] || res.data?.contact;
            displayName = firstContact?.name || displayName || "contact";
            entityId = firstContact?.id || firstContact?.email || displayName;
          }
        }

        if (!displayName) {
          displayName = cap?.verbalization?.entityNoun || "item";
        }

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

        req.onEvent?.({ type: "status", status: "waiting_for_confirmation", message: "Waiting for your confirmation..." });
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
            { conversationId, userId: req.userId },
            { $set: stmUpdates },
            { upsert: true }
          );
        }
      } catch (_) {}

      mainExecutionFinished = true;
      req.onChunk?.(response);
      req.onEvent?.({ type: "assistant_delta", text: response });

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
      mainExecutionFinished = true;
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

        mainExecutionFinished = true;
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
      // If the turn is an information query or data lookup, emit an immediate semantic query filler if not already emitted
      if (semanticTurn.primaryClassification === "INFORMATION_QUERY" && !earlyFillerEmitted) {
        const queryFiller = this.getSemanticFiller(semanticTurn);
        if (queryFiller) {
          const cleanFiller = queryFiller.replace(/[.!?\s]+$/, "") + ".\n\n";
          req.onChunk?.(cleanFiller);
        }
      }

      let historyMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];

      try {
        if (req.conversationId) {
          const loaded = await ConversationManager.getInstance().load(req.conversationId, req.userId);
          if (loaded && loaded.recentMessages && loaded.recentMessages.length > 0) {
            historyMessages = loaded.recentMessages.slice(-14).map((m: any) => ({
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

      if (req.surfaceContext?.activeExecutionTitle) {
        contextProjection += `\n[SITUATIONAL AMBIENT CONTEXT]: The user is currently executing '${req.surfaceContext.activeExecutionTitle}' (Category: ${req.surfaceContext.activeExecutionCategory || "Focus"}). Active Surface: ${req.surfaceContext.sourceSurface || "ambient"}. You are speaking with them while they are in active execution. Keep responses focused, respectful of their flow, and concise.\n`;
      }

      const systemPrompt =
        buildSupervisorPersonaPrompt(activeUserName) +
        contextProjection +
        "\n\nCRITICAL FORMATTING RULES FOR SPOKEN VOICE & CONVERSATION:\n" +
        "1. NEVER output markdown tables, pipe grids (|), or ASCII divider lines (---). Tables cannot be spoken aloud and break voice synthesis.\n" +
        "2. When explaining instructions, recipes, or workflows, keep them concise, structured with clear steps, and spoken naturally in active English.\n" +
        "3. Every sentence must end with clear punctuation (. or !) so voice synthesis streams and speaks aloud smoothly.\n" +
        "4. When the user interrupts or asks to pause/hold on, acknowledge gracefully in 1 composed sentence and wait for their direction.\n" +
        "5. Never output internal thought tags, raw JSON, or robotic preamble.\n" +
        "6. INVARIANT 9 (ZERO HALLUCINATED ACTIONS): You are in pure conversational dialogue. You did NOT execute any external tools, database actions, or media playback commands in this turn. NEVER claim, state, or pretend that you are playing music, pausing music, or modifying external systems.";

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
        } else {
          responseText = `I'm with you, ${activeUserName}. What are we working on?`;
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

        // Post-LLM Invariant 9 Guard: Prevent conversational LLM from claiming tool/playback execution
        const claimsPlayback =
          (lowerResp.includes("playing ") && (lowerResp.includes("spotify") || lowerResp.includes("track") || lowerResp.includes("playlist"))) ||
          (lowerResp.includes("pausing ") && (lowerResp.includes("track") || lowerResp.includes("music") || lowerResp.includes("spotify"))) ||
          lowerResp.includes("paused spotify");

        if (claimsPlayback) {
          responseText = `I couldn't trigger that playback right now, ${activeUserName}. Would you like me to try again?`;
        }
      }


      let stmUpdates: Record<string, any> | undefined = undefined;
      const asksConfirmation = responseText.includes("?") && (
        responseText.toLowerCase().includes("shall i") ||
        responseText.toLowerCase().includes("would you like me to") ||
        responseText.toLowerCase().includes("should i") ||
        responseText.toLowerCase().includes("do you want me to") ||
        responseText.toLowerCase().includes("would you like to confirm")
      );

      if (asksConfirmation) {
        const conversationalPendingOp: IPendingOperationContext = {
          operationId: generateId("pop"),
          turnId: generateId("turn"),
          actionType: (stm?.activeFocus?.entityType === "goal" ? "confirm_goal" : "create_temporal_series") as DomainActionType,
          domain: "productivity",
          partialPayload: {},
          missingRequirement: { kind: "CONFIRMATION" as any },
          clarificationQuestion: responseText,
          state: "AWAITING_CLARIFICATION",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        };

        stmUpdates = { pendingOperation: conversationalPendingOp };

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

      mainExecutionFinished = true;
      req.onChunk?.(responseText);
      req.onEvent?.({ type: "assistant_delta", text: responseText });

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
        stmUpdates,
        pendingOperation: stmUpdates?.pendingOperation,
      };
    }

    // 4. Multi-Agent / Specialist ReAct Execution Branch
    // Immediately emit natural Jarvis executive acknowledgement as Chunk 0 (< 15ms) if not already emitted
    let acknowledgement = "";
    if (!earlyFillerEmitted) {
      acknowledgement = this.getExecutiveAcknowledgement(req.message, routingDecision);
      if (acknowledgement) {
        const cleanAck = acknowledgement.replace(/[.!?\s]+$/, "") + ".\n\n";
        req.onChunk?.(cleanAck);
      }
    }

    // Ingest dialogue context if conversationId is provided so follow-up commands retain proposal details
    let contextualGoal = req.message;
    if (req.conversationId) {
      try {
        const loaded = await ConversationManager.getInstance().load(req.conversationId, req.userId);
        if (loaded?.recentMessages && loaded.recentMessages.length > 0) {
          const recent = loaded.recentMessages
            .slice(-14)
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
    mainExecutionFinished = true;
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
   * Model-Driven Semantic Filler Selection
   * Driven strictly by the LLM's classified domain and actionType (Zero Regex).
   */
  private getSemanticFiller(semanticTurn: SemanticTurn): string | null {
    if (semanticTurn.primaryClassification === "CASUAL_DIALOGUE") {
      return null;
    }

    if (semanticTurn.primaryClassification === "INFORMATION_QUERY") {
      const QUERY_FILLERS = [
        "One moment, checking that for you.",
        "Let me look that up for you.",
        "Pulling up your schedule now.",
        "Checking your agenda now, one moment.",
        "Looking into that for you now.",
        "Reviewing your records now.",
      ];
      const idx = Math.floor(Math.random() * QUERY_FILLERS.length);
      return QUERY_FILLERS[idx];
    }

    if (semanticTurn.operations.length === 0) {
      return null;
    }

    const firstOp = semanticTurn.operations[0];
    const actionType = firstOp?.actionType;
    const domain = firstOp?.domain;

    const FILLERS: Record<string, string[]> = {
      create_task: [
        "Right away, let me schedule that for you.",
        "On it, adding that to your schedule.",
        "One moment, putting that on your agenda.",
        "Understood, creating that task now.",
        "Taking care of that now, one moment.",
      ],
      complete_task: [
        "On it, marking that complete for you.",
        "Right away, checking that off for you.",
        "Understood, updating that task now.",
        "Taking care of that for you now.",
      ],
      adjust_task_priority: [
        "Understood, updating that priority now.",
        "Right away, adjusting that task's priority.",
        "On it, making that update now.",
      ],
      delete_task: [
        "Understood, removing that task for you.",
        "On it, deleting that from your schedule.",
      ],
      reschedule_task: [
        "One moment, rescheduling that for you.",
        "Understood, moving that on your schedule now.",
      ],
      propose_goal: [
        "Understood, structuring that habit for you now.",
        "Let me map out that routine for you, one moment.",
        "Putting that habit structure together now.",
      ],
      confirm_goal: [
        "Understood, activating that goal for you now.",
        "Confirming and setting that up now.",
      ],
      log_meal: [
        "Got it, logging your meal now.",
        "Noted, calculating the nutritional breakdown for you now.",
        "Recording that meal in your daily nutrition now.",
      ],
      log_workout: [
        "Understood, recording your workout session now.",
        "Noted, logging your training metrics now.",
      ],
      record_mental_estimate: [
        "Understood, logging your energy and recovery state.",
        "Noted, updating your wellness metrics now.",
      ],
      set_context_mode: [
        "Understood, switching your context mode now.",
        "Configuring your workspace mode now.",
      ],
    };

    const candidates = (actionType && FILLERS[actionType]) || (domain === "productivity"
      ? ["Understood, taking care of that for you now.", "On it, updating your system now."]
      : domain === "health"
      ? ["Checking your health context and logging that now.", "Understood, updating your health log now."]
      : domain === "wellness"
      ? ["Reviewing your wellness context and recording that now."]
      : ["Understood, processing that across your system now."]);

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Model-Driven Executive Acknowledgement
   * Driven by domain and routing decision (Zero Regex).
   */
  private getExecutiveAcknowledgement(message: string, decision: RoutingDecision): string {
    const domain = decision.targetDomain || (decision.selectedSpecialists && decision.selectedSpecialists[0]) || "productivity";

    if (domain === "productivity") {
      const options = [
        "Understood. Structuring that plan now.",
        "Mapping out the structure now.",
        "Putting that structure together now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    if (domain === "health") {
      const options = [
        "Checking your health and recovery metrics now.",
        "Reviewing your training context now.",
        "Checking your routine and metrics now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    if (domain === "wellness") {
      const options = [
        "Understood. Let's look at your workload and recovery.",
        "Reviewing your recovery balance now.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    const defaultOptions = [
      "Understood. Looking into that across your system now.",
      "Reviewing that across your system now.",
    ];
    return defaultOptions[Math.floor(Math.random() * defaultOptions.length)];
  }

  private async checkProviderConnection(
    userId: string,
    providerId: string
  ): Promise<{ connected: boolean; providerDisplayName: string }> {
    const { ProviderRegistry } = require("../external/providers/ProviderRegistry");
    const prov = ProviderRegistry.getInstance().get(providerId as any);
    const resolvedId = prov?.providerId || providerId;
    const displayName = prov?.displayName || providerId;

    if (
      prov?.authType === "NONE" ||
      resolvedId === "filesystem_desktop" ||
      resolvedId === "brave_search" ||
      resolvedId === "open_meteo" ||
      resolvedId === "openstreetmap_travel" ||
      resolvedId === "flight_tracker" ||
      resolvedId === "hotel_finder" ||
      resolvedId === "shopping_agent" ||
      resolvedId === "uber_mobility" ||
      resolvedId === "ola_mobility" ||
      resolvedId === "rapido_mobility" ||
      resolvedId === "zomato_eats" ||
      resolvedId === "zepto_commerce" ||
      resolvedId === "swiggy_suite" ||
      resolvedId === "aven_browser_agent"
    ) {
      return { connected: true, providerDisplayName: displayName };
    }

    try {
      let UserProviderConnectionModel: any = null;
      try {
        const mod = (await import("@/server/db/models/UserProviderConnection")) as any;
        UserProviderConnectionModel = mod.UserProviderConnection || mod.default;
      } catch (_) {}

      if (!UserProviderConnectionModel) {
        const g = globalThis as any;
        const gMongoose = g.mongoose?.conn || g.mongoose;
        UserProviderConnectionModel =
          gMongoose?.models?.UserProviderConnection ||
          require("mongoose").models?.UserProviderConnection;
      }

      if (UserProviderConnectionModel) {
        const conn = await UserProviderConnectionModel.findOne({
          $or: [
            { userId: { $in: [userId, userId?.toString()] }, providerId: { $in: [providerId, resolvedId] }, status: "ACTIVE" },
            { providerId: { $in: [providerId, resolvedId] }, status: "ACTIVE" },
          ],
        }).lean();
        return { connected: !!conn, providerDisplayName: displayName };
      }
    } catch (err) {
      console.error(`[Supervisor] checkProviderConnection DB error for '${providerId}':`, err);
    }

    // SAFETY: If DB lookup failed or Mongoose isn't ready, default to DISCONNECTED.
    // Never assume connected — this prevents hallucinated tool executions for unconfigured services.
    return { connected: false, providerDisplayName: displayName };
  }
}
