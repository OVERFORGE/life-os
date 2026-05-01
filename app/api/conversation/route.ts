import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { getAuthSession } from "@/lib/auth";

import { detectIntent } from "@/server/llm/intentModel";
import { logIntent } from "@/server/llm/debugLogger";
import { extractActions } from "@/server/llm/actionExtractor";
import { executeActions } from "@/server/llm/executionEngine";
import { runAutomation } from "@/server/automation/automationEngine";
import { buildContext } from "@/server/llm/contextBuilder";
import { generateResponse } from "@/server/llm/reasoningModel";
import { Goal } from "@/features/goals/models/Goal";
import { GoalProposal } from "@/server/db/models/GoalProposal";
import { User } from "@/server/db/models/User";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { message, model, mode = "general" } = await req.json();

  await connectDB();

  /* ===================================================== */
  /* 1. INTENT LAYER (LLM #1)                             */
  /* ===================================================== */
  
  const recentMessages = await ConversationMessage.find({ userId })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();
  recentMessages.reverse();
  const historyText = recentMessages.map((m: any) => `${m.role}: ${m.content}`).join("\n");

  // Check DB for a real pending proposal (drives confirm_goal intent)
  const pendingProposal = await GoalProposal.findOne({ userId, status: "pending" }).lean();
  const hasPendingProposal = !!pendingProposal;

  const { intent, confidence } = await detectIntent(message, historyText, model, hasPendingProposal);
  console.log(`\n🎯 [PIPELINE] Intent: "${intent}" (${(confidence * 100).toFixed(0)}%) | Input: "${message.slice(0, 80)}"`);  
  
  /* ===================================================== */
  /* 2. ACTION LAYER (LLM #2)                             */
  /* ===================================================== */

  const user = await User.findById(userId).select("settings").lean();
  const timezone = user?.settings?.timezone;

  const activeGoals = await Goal.find({ userId }).select("title").lean();
  const goalTitles = activeGoals.map(g => g.title).join(", ");

  const existingSignals = await LifeSignal.find({ userId, enabled: true }).select("key label inputType").lean();
  const existingSignalsList = existingSignals.map(s => `${s.key} (${s.label})`).join(", ");

  const actions = await extractActions(message, intent, goalTitles, existingSignalsList, model, mode, timezone);
  console.log(`⚡ [PIPELINE] Extracted Actions (${actions.length}):`, JSON.stringify(actions, null, 2));

  /* ===================================================== */
  /* 3. EXECUTION LAYER (NO LLM)                          */
  /* ===================================================== */

  let executionResults: any[] = [];
  if (actions.length > 0) {
      executionResults = await executeActions(actions, userId, model);
      console.log(`✅ [PIPELINE] Execution Results:`, JSON.stringify(executionResults, null, 2));
  } else {
      console.log(`⚠️  [PIPELINE] No actions extracted — skipping execution layer.`);
  }

  // FIX 3: Structured debug log after execution
  logIntent({
    input: message,
    intent,
    confidence,
    actionsExecuted: executionResults.map((r: any) => r.type || "unknown"),
  });

  /* ===================================================== */
  /* 4. CONTEXT BUILDING (INTELLIGENCE LAYER)             */
  /* ===================================================== */

  // Keep compatibility with old context string arrays but map the core intent and strictly isolate context mode domains
  const intelContext = await buildContext({ intents: [intent], userId, input: message, mode });

  /* ===================================================== */
  /* 5. RESPONSE LAYER (LLM #3)                           */
  /* ===================================================== */

  const groqStream = await generateResponse({ 
      input: message, 
      context: intelContext, 
      toolResults: executionResults,
      model,
      intentConfidence: confidence,  // FIX 2: pass confidence for safe fallback
  });

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";

      try {
        for await (const chunk of groqStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            controller.enqueue(
              new TextEncoder().encode(content)
            );
          }
        }
      } catch (err) {
        console.error("Groq Stream Error:", err);
      }

      controller.close();

      /* SAVE TO HISTORY */
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

      /* ===================================================== */
      /* 5. DETERMINISTIC AUTOMATION ENGINE (BACKGROUND SYNC)  */
      /* ===================================================== */
      // Runs fully asynchronously after response closes
      try {
        await runAutomation(userId);
      } catch (e) {
        console.error("Background Automation Error:", e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}