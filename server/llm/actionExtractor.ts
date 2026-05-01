import { groqChat, cleanLLMResponse } from "./groq";
import { getActiveDate } from "@/server/automation/timeUtils";

export type ExtractedAction = {
  type:
    | "log_activity" | "propose_goal" | "confirm_goal" | "delete_goal"
    | "update_weight" | "log_meal" | "log_workout"
    | "propose_diet_mode" | "confirm_diet_mode"
    | "create_task" | "update_task" | "complete_task" | "delete_task";
  payload: any;
};

export async function extractActions(input: string, intent: string, activeGoalsList: string = "", existingSignalsList: string = "", history: string = "", model?: string, mode: string = "general", timezone?: string): Promise<ExtractedAction[]> {
    // These intents specifically query logs or ask generic advice, skip extraction
    if (["get_insights", "ask_advice"].includes(intent)) {
        return [];
    }

    // confirm_goal is handled directly from conversation context — no LLM extraction needed
    if (intent === "confirm_goal") {
        return [{ type: "confirm_goal", payload: { userMessage: input } }];
    }

    // create_goal → always returns propose_goal so the system drafts a proposal first
    if (intent === "create_goal") {
        return [{ type: "propose_goal", payload: { userMessage: input } }];
    }

    // diet mode: proposal from user intent → propose phase
    if (intent === "propose_diet_mode") {
        // Extract mode from message with a quick regex pass
        const lower = input.toLowerCase();
        let mode = 'recomp';
        if (lower.includes('bulk') && (lower.includes('slight') || lower.includes('lean') || lower.includes('small'))) mode = 'slight_bulk';
        else if (lower.includes('bulk')) mode = 'bulk';
        else if (lower.includes('cut') && (lower.includes('slight') || lower.includes('small') || lower.includes('mini'))) mode = 'slight_cut';
        else if (lower.includes('cut') || lower.includes('deficit') || lower.includes('lose')) mode = 'cut';
        else if (lower.includes('recomp') || lower.includes('maintenance') || lower.includes('maintain')) mode = 'recomp';
        // Extract custom offset if mentioned (e.g. "300 calorie deficit")
        const numMatch = lower.match(/(\d{2,4})\s*(cal|kcal|calorie)/);
        const calorieOffset = numMatch ? (lower.includes('deficit') || lower.includes('cut') ? -parseInt(numMatch[1]) : parseInt(numMatch[1])) : undefined;
        return [{ type: "propose_diet_mode", payload: { mode, calorieOffset } }];
    }

    // User confirmed the diet mode proposal
    if (intent === "confirm_diet_mode") {
        // Try to detect a specific calorie amount in the confirmation
        const lower = input.toLowerCase();
        const numMatch = lower.match(/(\d{2,4})\s*(cal|kcal|calorie)?/);
        const calorieOffset = numMatch ? (lower.includes('deficit') || lower.includes('cut') ? -parseInt(numMatch[1]) : parseInt(numMatch[1])) : undefined;
        // We need the mode from prior context, so the conversation handler should pass it
        return [{ type: "confirm_diet_mode", payload: { calorieOffset } }];
    }

const generalSchemas = `
#### 1. log_activity
Use when user explicitly reports doing something — exercising, sleeping, reading, working, or overriding mental stats.
NEVER use this for weight logging, meal logging, or workout-as-meal context. Those have dedicated actions below.
CRITICAL: For signals, YOU MUST ONLY use keys from the "Existing Tracked Signals" list provided below. DO NOT invent new signal keys. If a user activity roughly matches an existing signal, map it. If it doesn't match anything, do NOT log it as a signal. 
Payload (only include fields that are EXPLICITLY mentioned):
{
  "gym": true,                          // Only if they mention workout/gym (and NOT specifically a food/meal context)
  "wakeTime": "7:00am",                 // Only if wake time stated
  "sleepTime": "11:30pm",               // Only if sleep time stated
  "deepWorkHours": 4,                   // MUST include this if the activity involves studying, coding, reading, or intense focus. Calculate the total hours implied.
  "mentalOverrides": {                  // ONLY if explicitly setting mood/stress/energy/anxiety/focus values
    "mood": 3,
    "energy": 7,
    "stress": 9,
    "anxiety": 5,
    "focus": 6
  },
  "signals": {                          // STRICTLY ONLY EXISTING SIGNAL KEYS
    "existing_key_1": 40,
    "existing_key_2": 20
  }
}

#### 2. update_weight
Use when user explicitly mentions their body weight (e.g. "I weigh X", "my weight is X", "today I'm Xkg", "weighed myself at X").
Payload:
{
  "weight": 70 // Numeric value in kg
}

#### 3. log_meal
Use when user mentions eating specific food items, tracking a meal, consuming calories, or applying a meal template.
Triggers: "ate", "just ate", "had", "eating", "ate X and Y", "log my [template name] meal plan", "apply [template] template".
Payload:
{
  "description": "exact phrase of what they ate or the template name, e.g. '4 bananas and 2 eggs' or 'bulk day'",
  "date": "YYYY-MM-DD" // ONLY include if they explicitly mention a past date (e.g. yesterday, on monday). Use current date context to calculate it.
}

#### 4. log_workout
Use when user mentions going to the gym, a workout session, or completing training (but NOT just logging that they exercised as a signal).
Use log_activity for gym=true signals unless the user is specifically asking to create a workout record.
Payload:
{
  "description": "exact phrase of the workout context, e.g. '1 hour of weightlifting' or 'hit the gym for 45 min'"
}

#### 5. create_goal
ONLY create this action if the user gives an EXPLICIT command to create a goal RIGHT NOW.
Trigger words: "create", "set up", "make a goal", "don't ask", "just do it", "set it up".
DO NOT create this action for vague exploratory inputs like "thinking of trying X" or "what should I track?".
CRITICAL: The "signals" array MUST ONLY contain keys from the "Existing Tracked Signals" list. If you need a new signal, use "newSignals", but keep it extremely concise and fundamental (MAX 1 OR 2 NEW SIGNALS). Do NOT create redundant signals. 
Payload:
{
  "title": "Goal Title",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible",
  "signals": ["existing_signal_key"],
  "newSignals": [ { "label": "Concise Name", "inputType": "number" | "checkbox" | "time", "categoryKey": "work" | "habits" | "physical", "weight": 5 } ]
}

#### 6. delete_goal
Use when user explicitly asks to delete, remove, drop, or kill a goal.
Match their description semantically against the Active Goals list.
Payload:
{
  "title": "The exact title copied verbatim from the 'User's Active Goals' list. Do not alter case or add words."
}

#### 7. create_task
Use when user wants to create, add, remind, or schedule a task.
Trigger words: "remind me", "create a task", "add task", "schedule", "I need to", "don't let me forget", "put on my list".
Resolve date references: "today"→today, "tomorrow"→tomorrow, "next Monday"→calculate.
Payload:
{
  "title": "Short task title",
  "description": "Optional detail",
  "dueDate": "YYYY-MM-DD or relative: today/tomorrow",
  "dueTime": "HH:MM (24h, only if explicitly mentioned)",
  "priority": "low" | "medium" | "high",
  "recurring": { "type": "daily" | "weekly" | "custom", "interval": 1 } // ONLY if user says daily/every day/weekly/every week
  "goalTitle": "Matching goal title if user links to a goal",
  "estimatedDuration": 30 // minutes, only if stated
}

#### 8. complete_task
Use when user explicitly completes, finishes, or skips a scheduled task, OR when they say they finished an activity that sounds like a specific to-do item (e.g. "I just finished my solana contract work", "done with my essay").
Also use for skip: "skip", "mark as skipped", "couldn't do it", "I was too tired".
Also use for "skip all tasks today", "reschedule my missed tasks".
Payload:
{
  "title": "Natural language title of the task they completed/skipped",
  "action": "complete" | "skip",  // default: complete
  "skipAll": true,                 // ONLY for "skip all tasks today"
  "rescheduleOverdue": true        // ONLY for "reschedule missed/overdue tasks"
}

#### 9. delete_task
Use when user wants to delete or remove a task (NOT a goal).
Trigger: "delete task", "remove task", "cancel task", "drop task".
Payload:
{
  "title": "Natural language title of the task to delete"
}

#### 10. update_task
Use when user wants to change or reschedule a specific task.
Trigger: "change task", "move task", "reschedule task", "update task", "push X to tomorrow".
Payload:
{
  "title": "Current task title hint",
  "dueDate": "new date if changed",
  "dueTime": "new time if changed",
  "priority": "new priority if changed",
  "description": "new description if changed"
}
`;

const healthSchemas = `
#### 1. update_weight
Use when user explicitly mentions logging or updating their physical body weight.
Payload:
{
  "weight": 70 // Numeric value
}

#### 2. log_meal
Use when user mentions eating specific food items, tracking a meal, consuming calories, or applying a 'meal template' (e.g. 'log bulk day').
Payload:
{
  "description": "exact phrase of what they ate or the template they want to use, e.g. '4 bananas and 2 eggs' or 'bulk day'",
  "date": "YYYY-MM-DD" // ONLY include if they explicitly mention a past date (e.g. yesterday, on monday). Use current date context to calculate it.
}

#### 3. log_workout
Use when user mentions going to the gym, exercising, training, or completing a workout session.
Payload:
{
  "description": "exact phrase of the workout context, e.g. '1 hour of weightlifting' or 'hit the gym'"
}

#### 4. propose_diet_mode
Use when user wants to change their diet plan, switch modes, or set a calorie goal.
Triggers: "switch to bulk", "I want to cut", "put me on a deficit", "let's do recomp", "start cutting", "want to lean bulk", "500 calorie surplus", "losing weight mode"
Payload: {}
(The system will parse the mode automatically from the intent)

#### 5. confirm_diet_mode
Use when the user confirms a proposed diet mode or calorie target (e.g. "yes sounds good", "do it", "perfect").
Payload: {}
(The system will apply the pending diet mode automatically)
`;

    // Health mode: restrict to health-only tools (no goal management)
    const schemas = mode === "health" ? healthSchemas : generalSchemas;

    const prompt = `
You are a deterministic action extraction engine for LifeOS.
Extract ALL executable actions from the user's message and return them as a strict JSON array.
DO NOT hallucinate. If a value is not explicitly mentioned, do not include it.

Recent Conversation History:
${history || "No history"}

User Message: "${input}"
Detected Intent: "${intent}"
User's Active Goals (for delete matching): [${activeGoalsList}]
Existing Tracked Signals (MUST USE FOR LOGGING/GOALS): [${existingSignalsList || "none"}]
Operating Mode: "${mode}"
Current Local Date Context: "${getActiveDate(timezone)}"

### CRITICAL DISAMBIGUATION INSTRUCTION:
If the user's message is a short choice (e.g. "the morning one", "the first one", "delete it"), look at the Recent Conversation History to see what specific items the system just presented. Extract the EXACT title of the intended task/goal from the history, rather than the user's vague phrase.

### ACTION SCHEMAS:
${schemas}

### MULTI-ACTION SUPPORT
A single message can contain multiple actions. Extract ALL of them.
Example: "I went to gym and delete my abs goal" → two actions: log_activity + delete_goal

### DATE RESOLUTION (for log_meal only)
The current local date is provided above. Use it to resolve relative date references:
- "today" → do NOT include date (let system use default)
- "yesterday" → subtract 1 day from current date
- "day before yesterday" → subtract 2 days
- "on Monday" / "last Monday" → calculate the most recent past Monday relative to current date
- "on Tuesday" (if today is Friday) → subtract 3 days (most recent past Tuesday)
- If no date is mentioned → do NOT include the date field at all
CRITICAL: Always output date as "YYYY-MM-DD" format only.

### OUTPUT FORMAT
Return ONLY valid JSON, nothing else:
{
  "actions": [
    { "type": "action_type", "payload": { ... } }
  ]
}

If nothing actionable is present, return: { "actions": [] }
`;

    try {
        const res = await groqChat({
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            model
        });
        const cleanRes = cleanLLMResponse(res);
        const parsed = JSON.parse(cleanRes);
        const extracted = Array.isArray(parsed.actions) ? parsed.actions : [];
        console.log(`📋 [EXTRACTOR] Raw LLM output: ${res.slice(0, 200)}`);
        return extracted;
    } catch (e) {
        console.error("Action Extraction Error:", e);
        return [];
    }
}
