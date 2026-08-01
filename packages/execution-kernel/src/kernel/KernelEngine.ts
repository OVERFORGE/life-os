import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { logIntent } from "../shared/debugLogger";
import { runAutomation } from "../automation/automationEngine";

import { Reasoner } from "../reasoning/Reasoner";
import { Planner } from "../planning/Planner";
import { PlanCompiler } from "../planning/PlanCompiler";
import { Scheduler } from "../scheduling/Scheduler";
import { Dispatcher } from "../dispatch/Dispatcher";
import { ReflectionEngine } from "../reflection/ReflectionEngine";
import { mapLegacyResultToOutcome } from "../reflection/ExecutionOutcome";
import { ExecutionContext } from "../runtime/ExecutionContext";
import { Brain } from "../brain/Brain";
import { WorldContextFormatter } from "../world/WorldContextFormatter";
import { ResponseGenerator } from "./ResponseGenerator";

export interface HandleInput {
  userId: string;
  message: string;
  model?: string;
  mode?: string;
}

export class KernelEngine {
  static async initialize(): Promise<void> {
    console.log("⚡ [KERNEL] Native Kernel Engine Initialized.");
  }

  static async runAutomation(userId: string) {
    return await runAutomation(userId);
  }

  static async handle(input: HandleInput, context?: ExecutionContext): Promise<Response> {
    const { userId, message, model, mode = "general" } = input;

    console.log(`\n🧠 [KERNEL] Processing request from User: ${userId}`);

    // 1. Context Creation & Brain Retrieval
    const brain = Brain.getInstance();
    const runtimeContext = context || new ExecutionContext({ userId, mode, timezone: "UTC" });

    // 2. Fetch WorldSnapshot read model
    const snapshot = brain.world.getSnapshot({ userId, mode });

    // 3. REASONING LAYER (Reasoner Subsystem)
    const reasoner = Reasoner.getInstance();
    const understanding = await reasoner.interpret(
      { message, model },
      runtimeContext
    );
    console.log(`🎯 [REASONER] Situation: "${understanding.situation}" (Confidence: ${understanding.confidence})`);

    // 4. PLANNING LAYER (Planner Subsystem)
    const planner = Planner.getInstance();
    const plan = await planner.plan(understanding, { message, model }, runtimeContext);
    console.log(`📋 [PLANNER] Generated Plan with ${plan.actions.length} Intended Action(s).`);

    // 5. PLAN COMPILING LAYER (PlanCompiler Subsystem)
    const jobs = PlanCompiler.compile(plan);
    console.log(`⚡ [PLANNER] Plan compiled to ${jobs.length} Job(s).`);

    // 6. SCHEDULING LAYER (Scheduler Subsystem)
    const scheduler = Scheduler.getInstance();
    const { eligible, deferred } = scheduler.evaluateEligibility(jobs);
    console.log(`⏱️  [SCHEDULER] Evaluated ${jobs.length} Job(s): ${eligible.length} eligible, ${deferred.length} deferred.`);

    // 7. DISPATCH LAYER (Dispatcher Subsystem -> Native Executor)
    const dispatcher = Dispatcher.getInstance();
    const executionResults = await dispatcher.dispatch(eligible, userId, model);
    if (executionResults.length > 0) {
      console.log(`✅ [KERNEL] Execution Results:`, JSON.stringify(executionResults, null, 2));

      // 8. REFLECTION LAYER (Reflection Subsystem -> Brain Update)
      const outcomes = executionResults.map((res) => mapLegacyResultToOutcome(res));
      ReflectionEngine.getInstance().reflect(outcomes);
      console.log(`🧠 [REFLECTION] Processed ${outcomes.length} execution outcome(s) into Brain updates.`);
    }

    logIntent({
      input: message,
      intent: understanding.situation,
      confidence: understanding.confidence,
      actionsExecuted: executionResults.map((r: any) => r.type || "unknown"),
    });

    // 9. World Snapshot Context Formatting
    const promptContext = WorldContextFormatter.formatForPrompt(snapshot);

    // 10. Native Response Generation
    const groqStream = await ResponseGenerator.getInstance().generateStream({
      input: message,
      context: promptContext,
      toolResults: executionResults,
      model,
      intentConfidence: understanding.confidence,
    });

    // 11. Construct ReadableStream & Save History
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

        // Save conversation history
        await ConversationMessage.create({
          userId,
          role: "user",
          content: message,
        });

        await ConversationMessage.create({
          userId,
          role: "assistant",
          content: fullResponse,
        });

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
