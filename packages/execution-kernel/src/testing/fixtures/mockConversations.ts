import { LoadedConversationState } from "../../kernel/ConversationManager";

export function createMockConversationState(overrides: Partial<LoadedConversationState> = {}): LoadedConversationState {
  return {
    conversation: {
      conversationId: "conv_test_001",
      userId: "test_user_001",
      title: "Test Session",
      summary: "User previously discussed thesis progress and recovery.",
      messageCount: 4,
      tokenEstimate: 420,
      lastMessageAt: new Date(),
    } as any,
    stm: {
      conversationId: "conv_test_001",
      userId: "test_user_001",
      activeEntity: {
        type: "task",
        id: "task_1",
        name: "Complete Thesis Chapter 1",
      },
      pendingConfirmations: [],
      currentWorkflow: null,
      contextData: {},
    } as any,
    recentMessages: [
      { role: "user", content: "I'm feeling quite exhausted today." },
      { role: "assistant", content: "I see. Let's make sure we protect your recovery while keeping critical priorities intact." },
    ],
    ...overrides,
  };
}
