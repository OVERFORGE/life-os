import { groqChat, cleanLLMResponse } from "./groq";

export type ExtractedAction = {
  type: "log_activity" | "propose_goal" | "confirm_goal" | "delete_goal";
  payload: any;
};

export async function extractActions(input: string, intent: string, activeGoalsList: string = "", model?: string): Promise<ExtractedAction[]> {
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

    const prompt = `
You are a deterministic action extraction engine for LifeOS.
Extract ALL executable actions from the user's message and return them as a strict JSON array.
DO NOT hallucinate. If a value is not explicitly mentioned, do not include it.

User Message: "${input}"
Detected Intent: "${intent}"
User's Active Goals (for delete matching): [${activeGoalsList}]

### ACTION SCHEMAS:

#### 1. log_activity
Use when user explicitly reports doing something — exercising, sleeping, reading, working, or overriding mental stats.
Payload (only include fields that are EXPLICITLY mentioned):
{
  "gym": true,                          // Only if they mention workout/gym
  "wakeTime": "7:00am",                 // Only if wake time stated
  "sleepTime": "11:30pm",               // Only if sleep time stated
  "deepWorkHours": 4,                   // Only if work/focus hours stated
  "mentalOverrides": {                  // ONLY if explicitly setting mood/stress/energy/anxiety/focus values
    "mood": 3,
    "energy": 7,
    "stress": 9,
    "anxiety": 5,
    "focus": 6
  },
  "signals": {                          // Any other named habits/activities with quantities
    "pages_read": 40,
    "meditation_minutes": 20,
    "water_glasses": 4
  }
}

#### 2. create_goal
ONLY create this action if the user gives an EXPLICIT command to create a goal RIGHT NOW.
Trigger words: "create", "set up", "make a goal", "don't ask", "just do it", "set it up".
DO NOT create this action for vague exploratory inputs like "thinking of trying X" or "what should I track?".
Payload:
{
  "title": "Goal Title",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible",
  "signals": ["existing_signal_key"],
  "newSignals": [ { "label": "signal name", "inputType": "number" | "checkbox" | "time" } ]
}

#### 3. delete_goal
Use when user explicitly asks to delete, remove, drop, or kill a goal.
Match their description semantically against the Active Goals list.
Payload:
{
  "title": "Exact matching title from active goals list"
}

### MULTI-ACTION SUPPORT
A single message can contain multiple actions. Extract ALL of them.
Example: "I went to gym and delete my abs goal" → two actions: log_activity + delete_goal

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
