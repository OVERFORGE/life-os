export interface ConversationMessageDTO {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface ConversationDTO {
  schemaVersion: 1;
  conversationId: string;
  userId: string;
  title?: string;
  summary?: string;
  recentMessages: ConversationMessageDTO[];
  activeEntity?: {
    id: string;
    type: string;
    name: string;
  } | null;
  pendingConfirmationsCount: number;
}
