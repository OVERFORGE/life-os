export type ConversationRole = "user" | "assistant" | "system";

export type ConversationMessage = {
  role: ConversationRole;
  content: string;
};

export type AssistantAction =
  | {
      type: "create_goal";
      title: string;
      goalType: "performance" | "identity" | "maintenance";
    }
  | {
      type: "pause_goal";
      goalId: string;
    }
  | {
      type: "log_event";
      event: string;
    }
  | null;

export type AssistantResponse = {
  message: string;
  action?: AssistantAction;
};