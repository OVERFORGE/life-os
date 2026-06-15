// scripts/testIntents.ts
// Run with: npx ts-node --project tsconfig.json scripts/testIntents.ts
// Or: npx tsx scripts/testIntents.ts

import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });

async function groqChat(messages: any[], temperature = 0.0, model = "llama-3.1-8b-instant") {
  const res = await client.chat.completions.create({ model, messages, temperature });
  return res.choices[0]?.message?.content || "";
}

function cleanLLM(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/g, "").replace(/```/g, "").trim();
}

const INTENT_DESCRIPTIONS = `
- log_activity: User is reporting something they did or a current state — exercised, slept, ate, worked, felt a certain way, experienced mood/energy/stress changes, drank water, took steps, etc.
- complete_task: User is indicating they finished, completed, accomplished, or took care of a specific scheduled to-do or task. Includes paying bills, submitting work, buying things, handling errands, finishing sessions, skipping/postponing tasks, saying they couldn't do something, or asking to reschedule missed tasks.
- create_task: User wants to create a new task, reminder, or to-do item. Words like "remind me", "I need to", "don't let me forget", "add to my list".
- update_task: User wants to change properties of an existing task — move it, reschedule it, change its priority, push it forward in time.
- delete_task: User wants to permanently remove/delete/cancel a task (not just complete it).
- ask_advice: User is asking for a recommendation, plan, strategy, or guidance. Questions about their diet, calorie targets, what to do today, how to improve, whether they're on track.
- get_insights: User wants to see historical stats, trends, progress over a time period (last week, last month, how have I been doing, etc.).
- create_goal: User wants to set up a new long-term goal, habit, or tracking objective.
- confirm_goal: User is responding to a previously proposed goal plan (accepting or modifying a goal draft).
- delete_goal: User wants to remove or abandon a goal, habit, or tracking objective.
- propose_diet_mode: User wants to switch their nutrition strategy — bulk, cut, recomp, maintain, or set a calorie target.
- confirm_diet_mode: User is accepting or confirming a previously proposed nutrition/diet change.
- casual_chat: General conversation, greetings, questions about LifeOS features, or anything else that doesn't fit above.
`.trim();

const SYSTEM_PROMPT = `You are a precision intent classifier for a personal life-tracking assistant called LifeOS. 

Your ONLY job is to classify the user's message into exactly one intent from the list below.
You must return ONLY valid JSON. No explanation. No markdown. No extra text.

## Intent Options:
${INTENT_DESCRIPTIONS}

## Important Disambiguation Rules:
1. If the user says they DID something concrete (paid, submitted, finished, knocked out, wrapped up, handled, took care of, got done, completed) — classify as "complete_task", NOT "log_activity".
2. If it's about feelings/energy/mood/sleep/exercise/food intake as ongoing states or past activities (NOT a scheduled task) — classify as "log_activity".
3. If the message is short and affirmative ("yes", "go ahead", "sure") and there's recent conversation about a goal proposal — lean toward "confirm_goal".
4. "Skip all my tasks" or "I couldn't do anything today" = "complete_task" (skip action).
5. Questions about current status or plans = "ask_advice". Questions about past periods = "get_insights".

## Output Format (strict JSON only):
{"intent": "<intent_key>", "confidence": <0.0-1.0>}`;

async function classify(input: string, context = ""): Promise<{ intent: string; confidence: number; raw: string }> {
  const userMsg = context ? `Recent context:\n${context}\n\nUser message: "${input}"` : `User message: "${input}"`;
  const raw = await groqChat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMsg },
  ]);
  try {
    const parsed = JSON.parse(cleanLLM(raw));
    return { intent: parsed.intent, confidence: parsed.confidence, raw };
  } catch {
    return { intent: "PARSE_ERROR", confidence: 0, raw };
  }
}

type TestCase = {
  category: string;
  input: string;
  expected: string;
  context?: string;
  edgeNote?: string;
};

const TEST_CASES: TestCase[] = [
  // ─── log_activity ──────────────────────────────────────────────────────
  { category: "log_activity", input: "I slept 7 hours last night", expected: "log_activity" },
  { category: "log_activity", input: "My mood is at 8 out of 10 today", expected: "log_activity" },
  { category: "log_activity", input: "I went to the gym", expected: "log_activity" },
  { category: "log_activity", input: "Feeling completely drained, energy is 1/10", expected: "log_activity" },
  { category: "log_activity", input: "I drank 3 liters of water", expected: "log_activity" },
  { category: "log_activity", input: "Did 10000 steps today", expected: "log_activity" },
  { category: "log_activity", input: "I coded for 3 hours straight", expected: "log_activity" },
  { category: "log_activity", input: "Stress is through the roof right now, like a 9/10", expected: "log_activity" },

  // ─── complete_task ─────────────────────────────────────────────────────
  { category: "complete_task", input: "I paid the electricity bill", expected: "complete_task", edgeNote: "Original failing case" },
  { category: "complete_task", input: "I finished my workout", expected: "complete_task" },
  { category: "complete_task", input: "Just wrapped up my deep work session", expected: "complete_task" },
  { category: "complete_task", input: "Knocked out the grocery shopping", expected: "complete_task" },
  { category: "complete_task", input: "Done with my Solana contract review", expected: "complete_task" },
  { category: "complete_task", input: "Submitted the assignment", expected: "complete_task" },
  { category: "complete_task", input: "Handled my morning emails", expected: "complete_task" },
  { category: "complete_task", input: "Skip all my tasks for today, I'm exhausted", expected: "complete_task", edgeNote: "Skip all" },
  { category: "complete_task", input: "I couldn't get anything done today, reschedule my overdue tasks", expected: "complete_task", edgeNote: "Reschedule overdue" },

  // ─── create_task ───────────────────────────────────────────────────────
  { category: "create_task", input: "Remind me to call the doctor tomorrow", expected: "create_task" },
  { category: "create_task", input: "Add a task to review the codebase on Friday", expected: "create_task" },
  { category: "create_task", input: "I need to buy groceries, put that on my list", expected: "create_task" },
  { category: "create_task", input: "Set a reminder for my dentist appointment next Monday", expected: "create_task" },
  { category: "create_task", input: "Don't let me forget to call mom this weekend", expected: "create_task" },

  // ─── update_task ───────────────────────────────────────────────────────
  { category: "update_task", input: "Move my gym session to tomorrow", expected: "update_task" },
  { category: "update_task", input: "Reschedule the doctor appointment to Friday", expected: "update_task" },
  { category: "update_task", input: "Push the code review task to next week", expected: "update_task" },
  { category: "update_task", input: "Change the priority of my project task to high", expected: "update_task" },

  // ─── delete_task ───────────────────────────────────────────────────────
  { category: "delete_task", input: "Delete my gym task", expected: "delete_task" },
  { category: "delete_task", input: "Remove the dentist reminder from my list", expected: "delete_task" },
  { category: "delete_task", input: "Cancel the meeting task I created", expected: "delete_task" },

  // ─── ask_advice ────────────────────────────────────────────────────────
  { category: "ask_advice", input: "What should my plan for today look like?", expected: "ask_advice", edgeNote: "Original failing case" },
  { category: "ask_advice", input: "Plan my day", expected: "ask_advice" },
  { category: "ask_advice", input: "What do you recommend I focus on?", expected: "ask_advice" },
  { category: "ask_advice", input: "Am I in a calorie deficit today?", expected: "ask_advice" },
  { category: "ask_advice", input: "How is my diet looking?", expected: "ask_advice" },
  { category: "ask_advice", input: "How should I spend today given I'm exhausted?", expected: "ask_advice" },

  // ─── get_insights ──────────────────────────────────────────────────────
  { category: "get_insights", input: "How have I been doing this past week?", expected: "get_insights" },
  { category: "get_insights", input: "Show me my stats for last month", expected: "get_insights" },
  { category: "get_insights", input: "What's my average mood over the past 30 days?", expected: "get_insights" },
  { category: "get_insights", input: "Am I improving in my deep work hours?", expected: "get_insights" },

  // ─── create_goal ───────────────────────────────────────────────────────
  { category: "create_goal", input: "I want to start tracking my daily coding hours as a goal", expected: "create_goal" },
  { category: "create_goal", input: "Create a goal for me to get 8 hours of sleep every night", expected: "create_goal" },
  { category: "create_goal", input: "Add a new goal to hit the gym 4 times a week", expected: "create_goal" },

  // ─── delete_goal ───────────────────────────────────────────────────────
  { category: "delete_goal", input: "Delete my fitness goal", expected: "delete_goal" },
  { category: "delete_goal", input: "Remove the Solana developer goal, I'm done with it", expected: "delete_goal" },
  { category: "delete_goal", input: "Drop my sleep tracking goal", expected: "delete_goal" },

  // ─── propose_diet_mode ─────────────────────────────────────────────────
  { category: "propose_diet_mode", input: "I want to start bulking", expected: "propose_diet_mode" },
  { category: "propose_diet_mode", input: "Switch me to a slight calorie deficit", expected: "propose_diet_mode" },
  { category: "propose_diet_mode", input: "I want to lose weight, put me in a cut", expected: "propose_diet_mode" },
  { category: "propose_diet_mode", input: "Change my diet to maintenance", expected: "propose_diet_mode" },

  // ─── casual_chat ───────────────────────────────────────────────────────
  { category: "casual_chat", input: "Hey, what's up?", expected: "casual_chat" },
  { category: "casual_chat", input: "How does LifeOS work?", expected: "casual_chat" },
  { category: "casual_chat", input: "Tell me something interesting", expected: "casual_chat" },

  // ─── EDGE CASES ────────────────────────────────────────────────────────
  { category: "EDGE: ambiguous", input: "I think I did something productive", expected: "casual_chat", edgeNote: "Should be low confidence → casual_chat (no action)" },
  { category: "EDGE: ambiguous", input: "Feeling good about today", expected: "log_activity", edgeNote: "Borderline — log or chat?" },
  { category: "EDGE: activity vs task", input: "I finished my workout", expected: "complete_task", edgeNote: "Workout task completion (not just logging activity)" },
  { category: "EDGE: activity vs task", input: "I worked out for 45 minutes", expected: "log_activity", edgeNote: "Duration detail = activity log, not task" },
  { category: "EDGE: no match task", input: "I finished my Batman training", expected: "complete_task", edgeNote: "Task not found in DB, but intent is still complete_task — engine handles not_found" },
  { category: "EDGE: compound", input: "I paid my bills and my energy is at 3 out of 10", expected: "complete_task", edgeNote: "Multi-signal — primary intent should win" },
  { category: "EDGE: compound", input: "I went to the gym and now I feel amazing", expected: "log_activity", edgeNote: "Activity + feeling — should be log" },
  { category: "EDGE: vague", input: "Done", expected: "casual_chat", edgeNote: "Too vague — should be low confidence" },
  { category: "EDGE: typo/informal", input: "finishd my solana wrk", expected: "complete_task", edgeNote: "Typo tolerance" },
  { category: "EDGE: question vs log", input: "What's my energy level?", expected: "ask_advice", edgeNote: "Question, not a log" },
  { category: "EDGE: delete vs complete", input: "Get rid of my workout task", expected: "delete_task", edgeNote: "Delete intent, not complete" },
  { category: "EDGE: create vs remind", input: "Remind me to take my meds at 9pm", expected: "create_task", edgeNote: "Reminder = task creation" },
];

// ─── Run all tests ──────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "═".repeat(80));
  console.log("  LifeOS Intent Classifier — Full Test Suite");
  console.log("  Model: llama-3.1-8b-instant | Temp: 0.0");
  console.log("═".repeat(80) + "\n");

  const results: { tc: TestCase; got: string; confidence: number; pass: boolean }[] = [];
  
  let pass = 0, fail = 0;

  for (const tc of TEST_CASES) {
    const { intent, confidence } = await classify(tc.input, tc.context);
    const ok = intent === tc.expected;
    const gated = confidence < 0.6 ? "(GATED→casual_chat)" : "";
    const effectiveIntent = confidence < 0.6 ? "casual_chat" : intent;
    const effectivePass = effectiveIntent === tc.expected;

    if (effectivePass) pass++; else fail++;

    const icon = effectivePass ? "✅" : "❌";
    const conf = (confidence * 100).toFixed(0).padStart(3);

    console.log(
      `${icon} [${conf}%] ${tc.category.padEnd(30)} | expected: ${tc.expected.padEnd(20)} | got: ${intent} ${gated}`
    );
    if (!effectivePass || tc.edgeNote) {
      if (tc.edgeNote) console.log(`       📝 ${tc.edgeNote}`);
      if (!effectivePass) console.log(`       ⚠️  Input: "${tc.input}"`);
    }

    results.push({ tc, got: effectiveIntent, confidence, pass: effectivePass });
  }

  const total = TEST_CASES.length;
  console.log("\n" + "─".repeat(80));
  console.log(`  Results: ${pass}/${total} passed (${((pass/total)*100).toFixed(1)}%) | ${fail} failed`);
  console.log("─".repeat(80) + "\n");

  if (fail > 0) {
    console.log("❌ FAILURES:");
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  • "${r.tc.input}"`);
      console.log(`    expected: ${r.tc.expected} | got: ${r.got} (${(r.confidence*100).toFixed(0)}%)`);
    });
  }
}

main().catch(console.error);
