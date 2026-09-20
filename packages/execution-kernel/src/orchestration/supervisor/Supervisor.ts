import { DynamicRouter, RoutingDecision } from "./DynamicRouter";
import { FastPathExecutor, FastPathContext } from "./FastPathExecutor";
import { ReActOrchestrator, ReActLoopResult } from "../react/ReActOrchestrator";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { ProductionTracer, ProductionTraceContext } from "../observability/ProductionTracer";
import { generateId } from "../../shared/ids";
import { groqChat, cleanLLMResponse } from "../../shared/groq";
import { ConversationManager } from "../../kernel/ConversationManager";

export interface SupervisorRequest {
  userId: string;
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
 * Supervisor (Chief of Staff)
 * 
 * Central cognitive orchestration authority for LifeOS.
 * Owns intake, routing, workspace lifecycle, specialist coordination, and user communication.
 * Invariant 1: Supervisor proposes decisions and asks the kernel to execute; never owns truth directly.
 * Invariant 28: Zero DAG terminology leaked to the end user.
 */
export class Supervisor {
  private static instance: Supervisor;

  constructor(
    private router: DynamicRouter,
    private fastPath: FastPathExecutor,
    private reactOrchestrator: ReActOrchestrator
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
    return new Supervisor(router, fastPath, reactOrchestrator);
  }

  async processRequest(req: SupervisorRequest): Promise<SupervisorResponse> {
    const startTime = Date.now();
    const executionId = generateId("exec");
    const requestId = req.requestId || generateId("req");

    // 1. Dynamic Routing Decision
    const routingDecision = this.router.route(req.message);

    // 2. Fast Path Execution Branch (<= 1000ms)
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

      const systemPrompt =
        "You are the LifeOS Chief of Staff — a charismatic, proactive, articulate executive partner and culinary advisor. " +
        "Communicate with warmth, energy, and vivid clarity. You assist the user with productivity, habits, wellness, recipes, and daily life. " +
        "CRITICAL FORMATTING RULES FOR SPOKEN VOICE & CONVERSATION: " +
        "1. NEVER output markdown tables, pipe grids (|), or ASCII divider lines (---). Tables cannot be spoken aloud and break voice synthesis. " +
        "2. When explaining recipes, cooking, or instructions, present it like a passionate TV chef: " +
        "   - Start with an exciting 1-sentence hook describing why the dish is delicious. " +
        "   - List ingredients cleanly using bullet points with everyday spoken measurements (e.g., '1 pound chicken thighs cut into bite-sized cubes', '2 tablespoons soy sauce'). " +
        "   - Give 3 to 4 clear, numbered step-by-step cooking instructions (Step 1, Step 2, Step 3, Step 4) in active, spoken English. " +
        "   - Finish with a pro chef tip for serving. " +
        "3. Every sentence must end with clear punctuation (. or !) so voice synthesis streams and speaks aloud smoothly. " +
        "4. When the user interrupts, asks you to stop, pause, hold on, or changes the topic mid-conversation: acknowledge gracefully in 1 friendly sentence (e.g., 'Holding right here. Take your time, what would you like to focus on?' or 'Paused. Whenever you are ready, let me know.') and address their new topic or wait for their lead. Never repeat previous unrequested content. " +
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
          responseText = "Hello! I'm ready to assist you. What would you like to focus on today?";
        } else {
          responseText = "I'm listening and ready to help. What's the next step you'd like to take?";
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
      targetSpecialists
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
   * Generates a warm, articulate, British Chief of Staff (Jarvis) executive acknowledgement
   * when entering cognitive specialist reasoning or multi-agent planning.
   */
  private getExecutiveAcknowledgement(message: string, decision: RoutingDecision): string {
    const lower = message.toLowerCase();

    // 1. Action confirmation & execution
    if (/\b(implement|execute|confirm|apply|commit|do it|go ahead|proceed|approve|make it so|sounds good|looks good)\b/i.test(lower)) {
      const options = [
        "Understood, putting that into action now.",
        "Right away, applying those updates for you.",
        "On it, executing that for you now.",
        "Understood, taking care of that right away.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 2. Goal creation, planning, structuring, scheduling
    if (decision.targetDomain === "productivity" || /\b(goal|goals|plan|plans|schedule|routine|target|habit|habits|roadmap)\b/i.test(lower)) {
      const options = [
        "Right away, let me organize that for you.",
        "Understood, structuring that plan now.",
        "On it, mapping that out for you.",
        "Right away, let me put that structure together.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 3. Health & physical domain
    if (decision.targetDomain === "health" || /\b(health|workout|diet|meal|sleep|training|exercise)\b/i.test(lower)) {
      const options = [
        "Right away, let me review your health metrics.",
        "Understood, checking your routine now.",
        "On it, analyzing your training and recovery.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 4. Wellness & recovery domain
    if (decision.targetDomain === "wellness" || /\b(wellness|stress|burnout|tired|energy|recovery|rest)\b/i.test(lower)) {
      const options = [
        "Understood, let's look at your workload and recovery.",
        "Right away, reviewing your wellness balance.",
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 5. Multi-agent & general cognitive analysis
    const defaultOptions = [
      "Right away, let me look into that for you.",
      "Understood, analyzing that for you now.",
      "On it, reviewing that across your system.",
    ];
    return defaultOptions[Math.floor(Math.random() * defaultOptions.length)];
  }
}
