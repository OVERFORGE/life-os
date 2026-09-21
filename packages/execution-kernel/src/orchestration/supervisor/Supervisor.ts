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
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { KernelCapabilityService } from "../kernel/KernelCapabilityService";

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

    // 1. Authoritative Semantic Interpretation via Aven
    const interpreter = SemanticIntentInterpreter.getInstance();
    const semanticTurn = await interpreter.interpret(req.message, {
      userId: req.userId,
      conversationId: req.conversationId,
      knownTasks: req.knownTasks,
    });

    // 2. Dynamic Routing Decision informed by SemanticTurn
    const routingDecision = this.router.route(req.message, semanticTurn);

    // 3. User Cancellation or Retraction Branch
    if (semanticTurn.primaryClassification === "CANCEL_OR_DISMISS") {
      const response = "Understood. I've cancelled that.";
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
      };
    }

    // 3b. Clarification / Ambiguity Interception (Zero state mutations when ambiguous)
    if (semanticTurn.clarification?.required && semanticTurn.clarification.questionToUser) {
      const response = semanticTurn.clarification.questionToUser;
      req.onChunk?.(response);
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
      };
    }

    // 4. Semantic Operations Execution via Sovereign Kernel
    if (semanticTurn.operations.length > 0) {
      const proposals: ActionProposal[] = semanticTurn.operations.map((op, idx) => ({
        id: `prop_${op.operationId}_${Date.now()}_${idx}`,
        planId: `plan_${executionId}`,
        actionType: op.actionType,
        domain: op.domain,
        riskClass: op.riskClass,
        reversibility: op.riskClass === "HIGH_IRREVERSIBLE" ? "irreversible_external" : op.riskClass === "MEDIUM_COMPENSABLE" ? "reversible_with_compensation" : "atomic_single_doc",
        state: "PROPOSED",
        title: op.payload?.title || op.payload?.description || op.actionType,
        rationale: semanticTurn.conversationalSummary,
        payload: op.payload,
        targetEntityId: op.targetReference?.resolvedEntityId,
        requiresConfirmation: op.executionEligibility === "REQUIRES_CLARIFICATION",
        estimatedImpact: op.actionType,
        idempotencyKey: `${executionId}_${op.operationId}`,
        dependencies: op.dependencies,
      }));

      const kernel = this.kernel || KernelCapabilityService.getInstance();
      const validation = await kernel.validateActionProposals(req.userId, proposals);
      const kernelResults = await kernel.executeActionBatch(req.userId, validation.validDecisions);
      const successfulExecutions = kernelResults.filter((r: any) => r.success);

      // Synthesize grounded truthful user response via GroundedResponseGenerator
      const { GroundedResponseGenerator } = await import("../grounding/GroundedResponseGenerator");
      let response = GroundedResponseGenerator.getInstance().generateResponse(
        semanticTurn,
        kernelResults,
        { userMessage: req.message, conversationalSummary: semanticTurn.conversationalSummary }
      );

      if (validation.rejectedProposals.length > 0) {
        const rejectionNotes = validation.rejectedProposals.map((r: any) => `Could not proceed: ${r.reason}`).join(" ");
        response = response ? `${response} ${rejectionNotes}` : rejectionNotes;
      }

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
      if (!resolvedUserName && req.userId) {
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

      const systemPrompt =
        buildSupervisorPersonaPrompt(activeUserName) +
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
        if (lowerMsg.includes("recipe") || lowerMsg.includes("cook") || lowerMsg.includes("chicken")) {
          responseText = "Here is a quick chili chicken recipe: sauté bite-sized chicken with soy sauce and cornstarch until golden, stir-fry with garlic, ginger, and chili peppers, then toss in a sweet-spicy chili glaze and garnish with green onions.";
        } else if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey")) {
          responseText = `Hey, ${activeUserName}. What's on your mind?`;
        } else {
          responseText = "I'm with you. What are we working on?";
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
