import { AssistantResponse } from "./types";

export function parseAssistantResponse(text: string) :AssistantResponse {
  const actionIndex = text.indexOf("ACTION_JSON:");

  if (actionIndex === -1) {
    return {
      message: text.trim(),
      action: null,
    };
  }

  const message = text.slice(0, actionIndex).trim();

  const jsonText = text
    .slice(actionIndex + "ACTION_JSON:".length)
    .trim();

  try {
    const action = JSON.parse(jsonText);

    return {
      message,
      action,
    };
  } catch {
    return {
      message: text.trim(),
      action: null,
    };
  }
}