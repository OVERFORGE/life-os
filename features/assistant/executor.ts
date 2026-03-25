import { Goal } from "@/features/goals/models/Goal";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";

export async function executeTool({
  tool,
  message,
  context,
  userId,
}: {
  tool: string | null;
  message: string;
  context: any;
  userId: string;
}) {
  if (!tool) return null;

  /* ===================================================== */
  /* 🟢 CREATE GOAL (SMART EXTRACTION)                     */
  /* ===================================================== */

  if (tool === "create_goal") {
    try {
      const extractRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model: "llama3.1:8b",
          prompt: `
Extract structured goal details from the message.

Message:
"${message}"

Return ONLY JSON:
{
  "title": "",
  "type": "performance | maintenance | identity",
  "cadence": "daily | weekly",
  "signals": [
    {
      "key": "",
      "weight": 1,
      "direction": "higher_better"
    }
  ]
}
          `,
          stream: false,
        }),
      });

      const data = await extractRes.json();

      let parsed;

      try {
        parsed = JSON.parse(data.response);
      } catch {
        parsed = {
          title: message,
          type: "performance",
          cadence: "daily",
          signals: [],
        };
      }

      const goal = await Goal.create({
        userId,
        title: parsed.title,
        type: parsed.type,
        cadence: parsed.cadence,
        signals: parsed.signals || [],
        rules: {
          minActiveDaysPerWeek: 3,
          graceDaysPerWeek: 2,
        },
      });

      return {
        success: true,
        goalId: goal._id,
        goal: parsed,
      };
    } catch (err) {
      return {
        success: false,
        error: "Goal creation failed",
      };
    }
  }

  /* ===================================================== */
  /* 🟢 LOG ACTIVITY (FIXED VERSION)                       */
  /* ===================================================== */

  if (tool === "log_activity") {
    try {
      const extractRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model: "llama3.1:8b",
          prompt: `
Extract activity details.

Message:
"${message}"

Return ONLY JSON:
{
  "activity": "",
  "durationHours": number
}
          `,
          stream: false,
        }),
      });

      const data = await extractRes.json();

      let parsed;

      try {
        parsed = JSON.parse(data.response);
      } catch {
        parsed = {
          activity: message,
          durationHours: 0,
        };
      }

      // TEMP: store as system log (later connect to DailyLog)
      await ConversationMessage.create({
        userId,
        role: "system",
        content: `Activity logged: ${parsed.activity} (${parsed.durationHours}h)`,
      });

      return {
        success: true,
        activity: parsed,
      };
    } catch (err) {
      return {
        success: false,
        error: "Activity logging failed",
      };
    }
  }

  /* ===================================================== */
  /* 🟡 DEFAULT                                           */
  /* ===================================================== */

  return null;
}