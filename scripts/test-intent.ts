// Intent classification tests — verifies all the patterns that were broken
import { detectIntent } from "../server/llm/intentModel";

const tests: { msg: string; pendingProposal?: boolean; expectedIntent: string }[] = [
  // Weight logging
  { msg: "Today I weigh 70kg", expectedIntent: "log_activity" },
  { msg: "my weight is 73.5kg", expectedIntent: "log_activity" },
  { msg: "I weighed myself at 75 lbs this morning", expectedIntent: "log_activity" },
  
  // Meal logging
  { msg: "I just ate 4 bananas and 2 eggs", expectedIntent: "log_activity" },
  { msg: "I had a big breakfast, rice and chicken", expectedIntent: "log_activity" },
  { msg: "Log my bulk day meal plan for today", expectedIntent: "log_activity" },
  { msg: "Apply the bulk template for today", expectedIntent: "log_activity" },
  { msg: "log food: oats and milk", expectedIntent: "log_activity" },

  // Diet/calorie queries
  { msg: "Am I eating enough? Am I in a deficit?", expectedIntent: "ask_advice" },
  { msg: "How is my diet today?", expectedIntent: "ask_advice" },
  { msg: "Am I in a calorie surplus or deficit?", expectedIntent: "ask_advice" },
  { msg: "how many calories have I had today?", expectedIntent: "ask_advice" },

  // Goal flows
  { msg: "Create a new goal for meditation", expectedIntent: "create_goal" },
  { msg: "yes this looks fine, make the goal", pendingProposal: true, expectedIntent: "confirm_goal" },
  { msg: "looks good to me", pendingProposal: true, expectedIntent: "confirm_goal" },
  { msg: "sure go ahead", pendingProposal: true, expectedIntent: "confirm_goal" },
  // no pending → should NOT be confirm
  { msg: "yes sounds good", pendingProposal: false, expectedIntent: "casual_chat" },
  
  // General activity
  { msg: "I hit the gym today", expectedIntent: "log_activity" },
  { msg: "My mood is at a 4 today", expectedIntent: "log_activity" },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = detectIntent(t.msg, "", undefined, t.pendingProposal ?? false);
  const ok = result.intent === t.expectedIntent;
  if (ok) {
    passed++;
    console.log(`✅ "${t.msg.slice(0, 50)}" → ${result.intent}`);
  } else {
    failed++;
    console.log(`❌ "${t.msg.slice(0, 50)}" → got: ${result.intent}, expected: ${t.expectedIntent}`);
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
