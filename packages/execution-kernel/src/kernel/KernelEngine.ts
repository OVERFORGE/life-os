import { logIntent } from "../shared/debugLogger";
import { runAutomation } from "../automation/automationEngine";

// Reasoning, Planning, Scheduling, Dispatch & Reflection
import { Reasoner } from "../reasoning/Reasoner";
import { Planner } from "../planning/Planner";
import { PlanCompiler } from "../planning/PlanCompiler";
import { Scheduler } from "../scheduling/Scheduler";
import { Dispatcher } from "../dispatch/Dispatcher";
import { ReflectionEngine } from "../reflection/ReflectionEngine";
import { mapLegacyResultToOutcome } from "../reflection/ExecutionOutcome";

// Runtime & Shared
import { ExecutionContext } from "../runtime/ExecutionContext";
import { Brain } from "../brain/Brain";
import { generateId } from "../shared/ids";
import { KERNEL_CONFIG } from "../shared/KernelConfig";
import { PerformanceTimer } from "../shared/PerformanceTimer";

// Kernel Components
import { ResponseGenerator } from "./ResponseGenerator";
import { ConversationManager } from "./ConversationManager";
import { EntityResolver } from "./EntityResolver";
import { ConfidenceGate } from "./ConfidenceGate";
import { ShortTermMemoryResolver } from "./ShortTermMemoryResolver";
import { ExecutionGraph } from "./ExecutionGraph";
import { AdaptiveRepairEngine } from "./AdaptiveRepairEngine";
import { ExecutionGraphApplier } from "./ExecutionGraphApplier";
import { HistoricalRetrievalEngine } from "./HistoricalRetrievalEngine";
import { ContextCollector } from "./ContextCollector";
import { TokenBudgetManager } from "./TokenBudgetManager";
import { ContextBuilder } from "./ContextBuilder";
import { ConversationSemantics } from "./ConversationSemantics";

// Phase 9 Sync Imports
import { DeviceIdentity } from "../sync/DeviceIdentity";
import { SyncJournal } from "../sync/SyncJournal";
import { SyncEngine } from "../sync/SyncEngine";
import { ReplicationManager } from "../sync/ReplicationManager";
import { CheckpointManager } from "../sync/CheckpointManager";

// Phase 10 Learning Engine Imports
import { LearningEngine } from "../learning/LearningEngine";

// Phase 11 World Model V2 Imports
import { WorldModelV2 } from "../worldv2/WorldModelV2";

// Phase 12 Diagnostics & Observability Imports
import { KernelTraceEngine } from "../diagnostics/KernelTraceEngine";
import { KernelProfiler } from "../diagnostics/KernelProfiler";
import { KernelMetricsRegistry } from "../diagnostics/KernelMetricsRegistry";
import { KernelDiagnosticsEngine } from "../diagnostics/KernelDiagnosticsEngine";

export interface HandleInput {
  userId: string;
  conversationId?: string;
  message: string;
  model?: string;
  mode?: string;
}

/**
 * KernelEngine
 * 
 * SOLE OWNER of orchestrating the complete LifeOS Kernel V1 execution pipeline:
 * Conversation → Reasoning → Planning → Scheduling → Dispatch → Reflection → Repair → Learning → World Model V2 → Diagnostics → HRAG → Context Collection → Token Budget → Context Builder → Response Generation
 */
export class KernelEngine {
  static async initialize(): Promise<void> {
    console.log(`⚡ ${KERNEL_CONFIG.LOG_TAGS.KERNEL} Native Kernel Engine V1 Initialized (${KERNEL_CONFIG.VERSION}).`);
  }

  static async runAutomation(userId: string) {
    return await runAutomation(userId);
  }

  static async handle(input: HandleInput, context?: ExecutionContext): Promise<Response> {
    const requestStartTime = Date.now();
    const requestId = generateId("req");
    const { userId, conversationId = "default", message, model, mode = KERNEL_CONFIG.DEFAULT_MODE } = input;

    console.log(`\n🧠 ${KERNEL_CONFIG.LOG_TAGS.KERNEL} Processing request ${requestId} for User: ${userId} (Conversation: ${conversationId})`);

    const traceEngine = new KernelTraceEngine();
    const profiler = KernelProfiler.getInstance();
    const metricsRegistry = KernelMetricsRegistry.getInstance();
    metricsRegistry.incrementRequests();

    // 1. CONVERSATION MANAGER — Load conversation state & recent history
    const loadedState = await PerformanceTimer.measure(
      {
        subsystem: "Conversation",
        inputSummary: `Conversation ${conversationId}`,
        getOutputSummary: (res) => `Loaded ${res.recentMessages.length} message(s)`,
        traceEngine,
        profiler,
      },
      async () => ConversationManager.getInstance().load(conversationId, userId)
    );

    const historyText = loadedState.recentMessages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    // 2. Context Creation & Brain Retrieval
    const brain = Brain.getInstance();
    const runtimeContext = context || new ExecutionContext({ userId, mode, timezone: KERNEL_CONFIG.DEFAULT_TIMEZONE });
    const snapshot = brain.world.getSnapshot({ userId, mode });

    // 3. REASONING LAYER — Language Understanding, emits ConversationSemantics
    const activeEntityName = loadedState.stm?.activeEntity?.name;
    const hasPendingProposal = (loadedState.stm?.pendingConfirmations?.length || 0) > 0;

    const understanding = await PerformanceTimer.measure(
      {
        subsystem: "Reasoner",
        inputSummary: `Message length ${message.length}`,
        getOutputSummary: (res) => `Situation: ${res.situation}`,
        traceEngine,
        profiler,
      },
      async () =>
        Reasoner.getInstance().interpret(
          {
            message,
            historyText,
            conversationSummary: loadedState.conversation?.summary || "",
            model,
            hasPendingProposal,
            activeEntityName,
          },
          runtimeContext
        )
    );
    console.log(`🎯 ${KERNEL_CONFIG.LOG_TAGS.REASONER} Situation: "${understanding.situation}" (Confidence: ${understanding.confidence})`);

    const semantics: ConversationSemantics = understanding.conversationSemantics || {
      conversationIntent: null,
      entityReference: null,
      confidence: understanding.confidence,
      isMutation: false,
    };

    // 4. ENTITY RESOLVER & CONFIDENCE GATE
    const entityResolver = EntityResolver.getInstance();
    const resolvedEntity = await entityResolver.resolve(
      semantics.entityReference,
      loadedState.stm,
      snapshot,
      userId
    );

    const confidenceGate = ConfidenceGate.getInstance();
    const gateResult = confidenceGate.evaluate(semantics, resolvedEntity);

    if (!gateResult.pass) {
      console.warn(`🛡️ [CONFIDENCE_GATE] Clarification required. Skipping execution.`);
      const clarification = gateResult.clarificationPrompt;
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(clarification));
          controller.close();
          await ConversationManager.getInstance().persist({
            conversationId,
            userId,
            userMessage: message,
            assistantResponse: clarification,
          });
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/plain" } });
    }

    // 5. SHORT-TERM MEMORY RESOLVER
    const stmResolver = ShortTermMemoryResolver.getInstance();
    const resolvedStmContext = stmResolver.resolve(semantics, resolvedEntity, loadedState.stm);

    // 6. PLANNING LAYER
    const plan = await PerformanceTimer.measure(
      {
        subsystem: "Planner",
        inputSummary: `Understanding: ${understanding.situation}`,
        getOutputSummary: (res) => `Plan actions: ${res.actions.length}`,
        traceEngine,
        profiler,
      },
      async () => Planner.getInstance().plan(understanding, { message, model }, runtimeContext)
    );
    console.log(`📋 ${KERNEL_CONFIG.LOG_TAGS.PLANNER} Generated Plan with ${plan.actions.length} Intended Action(s).`);

    // 7. PLAN COMPILING LAYER & SCHEDULER
    const { eligible, deferred } = await PerformanceTimer.measure(
      {
        subsystem: "Scheduler",
        inputSummary: "Plan actions to jobs",
        getOutputSummary: (res) => `Eligible: ${res.eligible.length}, Deferred: ${res.deferred.length}`,
        traceEngine,
        profiler,
      },
      () => {
        const jobs = PlanCompiler.compile(plan);
        return Scheduler.getInstance().evaluateEligibility(jobs);
      }
    );
    console.log(`⏱️  ${KERNEL_CONFIG.LOG_TAGS.SCHEDULER} Evaluated Job(s): ${eligible.length} eligible, ${deferred.length} deferred.`);

    // 8. DISPATCH LAYER → Native Executor
    const executionResults = await PerformanceTimer.measure(
      {
        subsystem: "Dispatcher",
        inputSummary: `Eligible jobs: ${eligible.length}`,
        getOutputSummary: (res) => `Execution results: ${res.length}`,
        traceEngine,
        profiler,
      },
      async () => Dispatcher.getInstance().dispatch(eligible, userId, model)
    );
    const outcomes = executionResults.map((res) => mapLegacyResultToOutcome(res));

    // 9. REFLECTION LAYER
    await PerformanceTimer.measure(
      {
        subsystem: "Reflection",
        inputSummary: `Outcomes: ${outcomes.length}`,
        getOutputSummary: () => "Reflected into Brain state",
        traceEngine,
        profiler,
      },
      () => {
        if (executionResults.length > 0) {
          ReflectionEngine.getInstance().reflect(outcomes);
          console.log(`🧠 ${KERNEL_CONFIG.LOG_TAGS.REFLECTION} Processed ${outcomes.length} execution outcome(s) into Brain updates.`);
        }
      }
    );

    logIntent({
      input: message,
      intent: understanding.situation,
      confidence: understanding.confidence,
      actionsExecuted: executionResults.map((r: any) => r.type || "unknown"),
    });

    // 10. EXECUTION GRAPH & ADAPTIVE REPAIR PLANNING
    const { executionGraph, planningResult, transactionResult } = await PerformanceTimer.measure(
      {
        subsystem: "AdaptiveRepair",
        inputSummary: `Outcomes count: ${outcomes.length}`,
        getOutputSummary: (res) => `Committed: ${res.transactionResult.committed}, Repair ops: ${res.planningResult.plan.operations.length}`,
        traceEngine,
        profiler,
      },
      async () => {
        const graph = await ExecutionGraph.buildFromDatabase(userId);
        const pResult = AdaptiveRepairEngine.getInstance().planRepair({
          graph,
          outcomes,
        });
        const tResult = ExecutionGraphApplier.getInstance().applyTransaction(
          graph,
          pResult.plan,
          pResult.diagnostics
        );
        return { executionGraph: graph, planningResult: pResult, transactionResult: tResult };
      }
    );

    if (planningResult.plan.operations.length > 0) {
      metricsRegistry.incrementRepairs(planningResult.plan.operations.length);
    }
    metricsRegistry.recordStability(planningResult.diagnostics.stabilityScore);
    metricsRegistry.recordGraphNodeCount(transactionResult.updatedSnapshot.nodeCount);

    // 11. LEARNING ENGINE (Phase 10 Adaptive Intelligence Layer)
    const learningResult = await PerformanceTimer.measure(
      {
        subsystem: "LearningEngine",
        inputSummary: `Outcomes: ${outcomes.length}`,
        getOutputSummary: (res) => `Patterns: ${res.learnedPatterns.length}, Signals: ${res.emittedSignals.length}`,
        traceEngine,
        profiler,
      },
      () => LearningEngine.getInstance().processObservations(outcomes)
    );
    metricsRegistry.recordLearningConfidence(learningResult.learnedPatterns[0]?.confidenceScore || 0.8);

    // 12. WORLD MODEL V2 (Phase 11 Adaptive Reality Engine)
    const worldSnapshotV2 = await PerformanceTimer.measure(
      {
        subsystem: "WorldModelV2",
        inputSummary: `Graph nodes: ${transactionResult.updatedSnapshot.nodeCount}`,
        getOutputSummary: (res) => `LifeState: ${res.lifeState.state}, Predictions: ${res.predictions.length}`,
        traceEngine,
        profiler,
      },
      () =>
        WorldModelV2.getInstance().computeSnapshot({
          graphSnapshot: transactionResult.updatedSnapshot,
          repairDiagnostics: planningResult.diagnostics,
          stabilityScore: planningResult.diagnostics.stabilityScore,
          profile: learningResult.activeProfile,
          learningSignals: learningResult.emittedSignals,
        })
    );
    metricsRegistry.incrementWorldSnapshots();
    metricsRegistry.incrementPredictions(worldSnapshotV2.predictions.length);

    // 13. KERNEL DIAGNOSTICS ENGINE (Phase 12 Observability Layer)
    const totalDurationSoFar = Date.now() - requestStartTime;
    const diagnosticSnapshot = KernelDiagnosticsEngine.getInstance().generateSnapshot({
      requestId,
      totalDurationMs: totalDurationSoFar,
      traceEngine,
      stabilityScore: planningResult.diagnostics.stabilityScore,
      deadNodeCount: planningResult.diagnostics.deadNodeIds.length,
      blockedNodeCount: transactionResult.updatedSnapshot.blockedNodes.length,
    });
    console.log(
      `📊 ${KERNEL_CONFIG.LOG_TAGS.DIAGNOSTICS} Health: ${diagnosticSnapshot.healthSummary.status} (${diagnosticSnapshot.healthSummary.score}/100)`
    );

    // 14. DISTRIBUTED SYNC PIPELINE
    const deviceIdentity = DeviceIdentity.getInstance().getDeviceMetadata();
    const syncJournal = SyncJournal.getInstance();
    const syncEngine = SyncEngine.getInstance();
    const replicationManager = ReplicationManager.getInstance();
    const checkpointManager = CheckpointManager.getInstance();

    if (transactionResult.committed) {
      syncJournal.append({
        eventId: planningResult.plan.id,
        graphVersion: transactionResult.outputVersion,
        repairId: planningResult.plan.id,
        timestamp: planningResult.plan.timestamp,
        deviceId: deviceIdentity.deviceId,
        sessionId: deviceIdentity.sessionId,
        operationType: "RepairTransaction",
        status: "Applied",
        payload: { operationsCount: planningResult.plan.operations.length },
      });
    }

    await syncEngine.processSync(executionGraph);
    replicationManager.createBatch();
    checkpointManager.createCheckpoint({
      graph: executionGraph,
      conversationState: loadedState,
      worldSnapshot: snapshot,
    });
    metricsRegistry.incrementCheckpoints();

    // 15. HISTORICAL RETRIEVAL ENGINE (HRAG)
    const historicalContext = await PerformanceTimer.measure(
      {
        subsystem: "HistoricalRetrieval",
        inputSummary: `Query: ${message}`,
        getOutputSummary: (res) => `Found records: ${res?.totalFound || 0}`,
        traceEngine,
        profiler,
      },
      async () => HistoricalRetrievalEngine.getInstance().retrieve(userId, semantics, message)
    );

    // 16. CONTEXT COLLECTOR — Gather raw context from all sources
    const collectedContext = await PerformanceTimer.measure(
      {
        subsystem: "ContextCollector",
        inputSummary: "Raw context sources",
        getOutputSummary: () => "CollectedContext object",
        traceEngine,
        profiler,
      },
      () =>
        ContextCollector.getInstance().collect({
          conversationSummary: loadedState.conversation?.summary || "",
          recentMessages: loadedState.recentMessages,
          stm: loadedState.stm,
          snapshot,
          toolResults: executionResults,
          historicalContext,
          executionGraphSnapshot: transactionResult.updatedSnapshot,
          repairPlan: planningResult.plan,
          repairDiagnostics: planningResult.diagnostics,
          stabilityScore: planningResult.diagnostics.stabilityScore,
          learningSignals: learningResult.emittedSignals,
          behavioralProfile: learningResult.activeProfile,
          worldSnapshotV2,
          moduleContext: semantics.moduleContext,
        })
    );

    // 17. TOKEN BUDGET MANAGER & CONTEXT BUILDER
    const promptPayload = await PerformanceTimer.measure(
      {
        subsystem: "ContextBuilder",
        inputSummary: "Allocate budgets & build prompt",
        getOutputSummary: () => "PromptPayload generated",
        traceEngine,
        profiler,
      },
      () => {
        const budgetAllocation = TokenBudgetManager.getInstance().allocate(collectedContext);
        metricsRegistry.recordContextSize(budgetAllocation.estimatedTotalTokens);
        return ContextBuilder.getInstance().build(collectedContext, budgetAllocation, message, model);
      }
    );

    // 18. RESPONSE GENERATOR — Stream response from PromptPayload
    const groqStream = await ResponseGenerator.getInstance().generateStream(promptPayload);

    // 19. Construct ReadableStream & Persist via ConversationManager
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = "";

        try {
          for await (const chunk of groqStream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(new TextEncoder().encode(content));
            }
          }
        } catch (err) {
          console.error("Groq Stream Error:", err);
        }

        controller.close();

        // Delegate persistence & async rolling summarization trigger to ConversationManager
        try {
          await ConversationManager.getInstance().persist({
            conversationId,
            userId,
            userMessage: message,
            assistantResponse: fullResponse,
            stmUpdates: resolvedStmContext.stmUpdates,
          });
        } catch (e) {
          console.error("Conversation Persistence Error:", e);
        }

        // Background Automation
        try {
          await runAutomation(userId);
        } catch (e) {
          console.error("Background Automation Error:", e);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain" },
    });
  }
}
