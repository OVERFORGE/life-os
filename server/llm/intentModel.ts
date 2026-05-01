// ============================================================
// 🎯 LLM-BASED INTENT CLASSIFIER
//
// Architecture:
//   - Stage 1: Hard guards — fast, zero-cost checks for states
//               that MUST be handled deterministically (pending
//               proposals, unambiguous system commands like
//               "skip all tasks today"). These run in microseconds.
//
//   - Stage 2: LLM classifier — llama-3.1-8b-instant (tiny,
//               fast, cheap) maps ANY natural-language input to
//               a bounded intent enum. Determinism comes from
//               the output schema, not the input processing.
//               Latency: ~150ms. Runs in parallel with action extraction.
//
// This means there are zero hardcoded phrase lists.
// The LLM understands "I paid the bill", "done with my essay",
// "knocked it out", "wrapped up my session" — all correctly.
// ============================================================

import { groqChat, cleanLLMResponse } from "./groq";

export type Intent =
  | "log_activity"
  | "complete_task"
  | "create_task"
  | "update_task"
  | "delete_task"
  | "ask_advice"
  | "get_insights"
  | "create_goal"
  | "confirm_goal"
  | "delete_goal"
  | "propose_diet_mode"
  | "confirm_diet_mode"
  | "casual_chat";

const INTENT_DESCRIPTIONS = `
- log_activity: User is reporting an ongoing activity, a physical/mental state, or a general life event — e.g. slept 7 hours, mood is 8/10, worked out for 45 minutes, drank 3L water, energy level, stress level. Use this when the user describes HOW they did something (duration, intensity, quantity) rather than simply saying it's done.
- complete_task: User is reporting that a specific named task or to-do item is now done. Use when they mention completing errands, bills, submissions, appointments, or sessions WITHOUT measurement details (e.g. "paid the bill", "finished my Solana work", "knocked out the meeting"). If the message contains BOTH a task completion AND a state log (compound), pick complete_task as primary.
- create_task: User wants to create a new task, reminder, or to-do item. Words like "remind me", "I need to", "don't let me forget", "add to my list".
- update_task: User wants to change properties of an existing task — move it, reschedule it, change its priority, push it forward in time.
- delete_task: User wants to permanently remove/delete/cancel a task (not just complete it).
- ask_advice: User is asking for a recommendation, plan, strategy, or guidance about what to do NOW or in the NEAR FUTURE — e.g. "what should I do today", "how is my diet looking", "am I in a deficit", "how should I spend today". If it's a question about current status, use ask_advice.
- get_insights: User wants to review HISTORICAL data or TRENDS over a past time window — e.g. "last week", "last month", "past 30 days", "how have I been doing", "show me my stats".
- create_goal: User wants to set up a new long-term goal, habit, or tracking objective.
- confirm_goal: User is responding to a previously proposed goal plan (accepting or modifying a goal draft).
- delete_goal: User wants to remove or abandon a goal, habit, or tracking objective.
- propose_diet_mode: User wants to INITIATE or SWITCH their nutrition strategy — bulk, cut, recomp, maintain, or change calorie target. Use when the user is requesting a change ("I want to bulk", "switch to cut", "change my diet to maintenance", "start a cut").
- confirm_diet_mode: User is ACCEPTING a diet mode change that was ALREADY PROPOSED in the conversation (e.g. replying "yes" or "sounds good" to a diet proposal the assistant just made).
- casual_chat: General conversation, greetings, questions about LifeOS, vague/unclear messages with no specific action, or single-word responses with no clear intent.
`.trim();

// ── Stage 1: Hard guards — deterministic, runs first ──────────────────────────
// Only keep guards for things that MUST be zero-latency or context-dependent:
// 1. confirm_goal — requires DB state (hasPendingProposal)
// 2. confirm_diet_mode — requires knowing a proposal was just made (short message + recent diet context)
function applyHardGuards(
  msg: string,
  hasPendingProposal: boolean
): { intent: Intent; confidence: number } | null {
  // confirm_goal: ONLY fires when we know there's a pending DB proposal
  if (hasPendingProposal) {
    const rejectWords = ["no", "nope", "don't", "change", "modify", "instead", "different"];
    const acceptWords = ["yes", "yeah", "yep", "sure", "ok", "go ahead", "do it", "create", "make it", "looks good", "perfect", "approved", "sounds good", "correct", "fine"];
    if (acceptWords.some(kw => msg.includes(kw)) || rejectWords.some(kw => msg.includes(kw))) {
      return { intent: "confirm_goal", confidence: 0.95 };
    }
  }
  return null;
}

// ── Stage 2: LLM classifier ────────────────────────────────────────────────────
async function classifyWithLLM(
  input: string,
  history: string,
  model?: string
): Promise<{ intent: Intent; confidence: number }> {
  const classifierModel = "llama-3.1-8b-instant"; // Fast, cheap — purpose-built for this

  const systemPrompt = `You are a precision intent classifier for a personal life-tracking assistant called LifeOS. 

Your ONLY job is to classify the user's message into exactly one intent from the list below.
You must return ONLY valid JSON. No explanation. No markdown. No extra text.

## Intent Options:
${INTENT_DESCRIPTIONS}

## Critical Disambiguation Rules (read carefully):

1. TASK COMPLETION vs LOG ACTIVITY — The key test: did the user name a specific to-do or errand that's now done?
   - "I finished my workout" → log_activity (workout = recurring physical activity, not a named task)
   - "I finished the Solana session" → complete_task (named work session = specific task)
   - "I paid the electricity bill" → complete_task (specific errand = task)
   - "I worked out for 45 minutes" → log_activity (has measurement detail, describing the activity)
   - RULE: If the message says they finished/completed something named and specific (a bill, a submission, a project, an appointment), use complete_task. Generic physical/mental activities (gym, workout, run) = log_activity.

2. COMPOUND MESSAGES — If the user mentions both completing a task AND reporting a state (e.g. "I paid the bill and my energy is 3/10"), use complete_task as the primary intent. The log will be extracted separately.

3. ASK ADVICE vs GET INSIGHTS:
   - "How is my diet looking?" → ask_advice (current status question)
   - "How was my diet last week?" → get_insights (past period)
   - RULE: "How is X" = ask_advice. "How was X / show me X over last N days" = get_insights.

4. PROPOSE DIET MODE vs CONFIRM DIET MODE:
   - "I want to bulk" / "Change my diet to maintenance" / "Switch to a cut" → propose_diet_mode (initiating a change)
   - "Yes, do it" / "Sounds good" (after assistant proposed a diet) → confirm_diet_mode (accepting a previous proposal)
   - RULE: If the user is REQUESTING a change, use propose_diet_mode. Only use confirm_diet_mode if the conversation context shows the assistant just made a diet proposal.

5. VAGUE / UNCERTAIN MESSAGES — If the message is a single word ("Done", "Ok", "Sure") with NO context, or uses hedging language ("I think I did", "maybe I", "not sure if"), use casual_chat with low confidence.

6. Questions about current status, today's plan, or near-future guidance = ask_advice.
   Questions about the past (last week, last month, trends) = get_insights.

7. CONTEXTUAL DISAMBIGUATION: If the chat history shows the assistant JUST asked the user to clarify WHICH task they meant (e.g., "Which one of these you meant to mark as completed?"), and the user answers with a selection ("the morning one", "the first one", "the second"), you MUST classify it as the intent the assistant was trying to execute (e.g., complete_task). Do not classify as casual_chat.

## Output Format (strict JSON only):
{"intent": "<intent_key>", "confidence": <0.0-1.0>}

Set confidence < 0.6 if the message is genuinely ambiguous or too vague to classify with certainty.`;

  const userPrompt = history
    ? `Recent conversation context:\n${history}\n\nUser's current message: "${input}"`
    : `User's message: "${input}"`;

  try {
    const raw = await groqChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.0, // Zero temperature = maximally deterministic
      model: classifierModel,
    });

    const cleaned = cleanLLMResponse(raw);
    const parsed = JSON.parse(cleaned);

    // Validate the intent is in our allowed set
    const validIntents: Intent[] = [
      "log_activity", "complete_task", "create_task", "update_task",
      "delete_task", "ask_advice", "get_insights", "create_goal",
      "confirm_goal", "delete_goal", "propose_diet_mode", "confirm_diet_mode",
      "casual_chat"
    ];

    const resolvedIntent = validIntents.includes(parsed.intent) ? parsed.intent as Intent : "casual_chat";
    const resolvedConfidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.85;

    // FIX 1: Confidence gate — never execute actions if model is uncertain
    // This prevents wrong DB mutations from ambiguous inputs.
    if (resolvedConfidence < 0.6) {
      console.warn(`[IntentClassifier] Low confidence (${(resolvedConfidence * 100).toFixed(0)}%) for intent "${resolvedIntent}" — gating to casual_chat`);
      return { intent: "casual_chat", confidence: resolvedConfidence };
    }

    if (!validIntents.includes(parsed.intent)) {
      console.warn("[IntentClassifier] LLM returned invalid intent:", parsed.intent, "— defaulting to casual_chat");
    }

    return { intent: resolvedIntent, confidence: resolvedConfidence };

  } catch (err) {
    // If LLM call fails, fall back to a simple heuristic so the app doesn't break
    console.error("[IntentClassifier] LLM failed, using fallback heuristic:", err);
    return fallbackHeuristic(input);
  }
}

// ── Emergency fallback (only if LLM call completely fails) ───────────────────
// Very intentionally minimal — just enough to not crash the pipeline.
function fallbackHeuristic(input: string): { intent: Intent; confidence: number } {
  const msg = input.toLowerCase();

  // Only the highest-signal, most unambiguous patterns as a last resort
  if (msg.match(/\b(delete|remove|drop|kill)\b.*\b(goal|task)\b/)) return { intent: "delete_task", confidence: 0.7 };
  if (msg.match(/\b(remind me|create.*task|add.*task|new task)\b/)) return { intent: "create_task", confidence: 0.7 };
  if (msg.match(/\b(i finished|i completed|i paid|i submitted|just finished|done with)\b/)) return { intent: "complete_task", confidence: 0.7 };
  if (msg.match(/\b(slept|woke|gym|workout|mood|energy|stress|ate|drank)\b/)) return { intent: "log_activity", confidence: 0.7 };
  if (msg.match(/\b(plan|advice|recommend|suggest|what should i)\b/)) return { intent: "ask_advice", confidence: 0.7 };
  if (msg.match(/\b(last week|last month|my stats|history|trend|progress)\b/)) return { intent: "get_insights", confidence: 0.7 };

  return { intent: "casual_chat", confidence: 0.5 };
}

// ── Public API ─────────────────────────────────────────────────────────────────
export async function detectIntent(
  input: string,
  history: string = "",
  model?: string,
  hasPendingProposal: boolean = false
): Promise<{ intent: string; confidence: number }> {

  // Stage 1: Hard guards (sync, zero-latency)
  const hardGuardResult = applyHardGuards(input.toLowerCase(), hasPendingProposal);
  if (hardGuardResult) {
    console.log(`[IntentClassifier] Hard guard fired → ${hardGuardResult.intent}`);
    return hardGuardResult;
  }

  // Stage 2: LLM classifier (async, ~150ms)
  const result = await classifyWithLLM(input, history, model);
  console.log(`[IntentClassifier] LLM classified → ${result.intent} (confidence: ${result.confidence})`);
  return result;
}
