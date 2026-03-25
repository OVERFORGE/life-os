import { detectIntent } from "./intent";
import { decideAction } from "./decision";
import { routeTool } from "./toolRouter";
import { executeTool } from "./executor";

export async function runAssistantBrain({
  message,
  context,
  userId,
}: {
  message: string;
  context: any;
  userId: string;
}) {
  // 1. Intent Detection
  const intent = await detectIntent(message, context);

  // 2. Decision
  const decision = decideAction(intent);

  if (!decision.requiresTool) {
    return {
      type: "response_only",
      intent,
    };
  }

  // 3. Route Tool
  const tool = routeTool(intent);

  // 4. Execute Tool
  const result = await executeTool({
    tool,
    message,
    context,
    userId,
  });

  return {
    type: "tool_executed",
    intent,
    tool,
    result,
  };
}