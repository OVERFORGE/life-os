import { Conversation, IConversation } from "@/server/db/models/Conversation";
import { ConversationMessage, IConversationMessage } from "@/server/db/models/ConversationMessage";
import { ConversationShortTermMemory, IConversationShortTermMemory } from "@/server/db/models/ConversationShortTermMemory";
import { ConversationSummarizer } from "./ConversationSummarizer";

export interface LoadedConversationState {
  conversation: IConversation | null;
  stm: IConversationShortTermMemory | null;
  recentMessages: { role: "user" | "assistant" | "system"; content: string }[];
}

export interface PersistOptions {
  conversationId: string;
  userId: string;
  userMessage: string;
  assistantResponse: string;
  stmUpdates?: Record<string, any>;
}

/**
 * Estimate token count roughly (~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

/**
 * ConversationManager
 * 
 * Single owner of conversation lifecycle and persistence.
 * Centralizes loading, message saving, metadata updates, and short-term memory persistence.
 */
export class ConversationManager {
  private static instance: ConversationManager;

  static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  /**
   * Loads conversation metadata, STM state, and recent message history from DB.
   */
  async load(conversationId: string, userId: string): Promise<LoadedConversationState> {
    const [conversation, stm, rawMessages] = await Promise.all([
      Conversation.findOne({ conversationId, userId }).lean(),
      ConversationShortTermMemory.findOne({ conversationId, userId }).lean(),
      ConversationMessage.find({ conversationId, userId })
        .sort({ createdAt: 1 })
        .select("role content")
        .lean(),
    ]);

    const recentMessages = (rawMessages || []).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    return {
      conversation: (conversation as any) || null,
      stm: (stm as any) || null,
      recentMessages,
    };
  }

  /**
   * Persists user and assistant messages, updates conversation metadata,
   * persists updated Short-Term Memory state, and triggers async rolling summarization.
   */
  async persist(options: PersistOptions): Promise<void> {
    const { conversationId, userId, userMessage, assistantResponse, stmUpdates } = options;
    const now = new Date();

    const userTokens = estimateTokens(userMessage);
    const assistantTokens = estimateTokens(assistantResponse);
    const totalNewTokens = userTokens + assistantTokens;

    // 1. Create message records in parallel
    await Promise.all([
      ConversationMessage.create({
        conversationId,
        userId,
        role: "user",
        content: userMessage,
        tokenEstimate: userTokens,
      }),
      ConversationMessage.create({
        conversationId,
        userId,
        role: "assistant",
        content: assistantResponse,
        tokenEstimate: assistantTokens,
      }),
    ]);

    // 2. Update Conversation metadata atomically
    await Conversation.updateOne(
      { conversationId, userId },
      {
        $set: { lastMessageAt: now },
        $inc: { messageCount: 2, tokenEstimate: totalNewTokens },
      }
    );

    // 3. Persist Short-Term Memory updates if provided
    if (stmUpdates && Object.keys(stmUpdates).length > 0) {
      await ConversationShortTermMemory.updateOne(
        { conversationId, userId },
        { $set: stmUpdates },
        { upsert: true }
      );
    }

    console.log(
      `💾 [CONVERSATION_MANAGER] Persisted messages & updated metadata for conversation ${conversationId}`
    );

    // 4. Trigger rolling summarization asynchronously (non-blocking)
    ConversationSummarizer.getInstance()
      .checkAndSummarize(conversationId, userId)
      .catch((err) => console.error("Async summarization trigger error:", err));
  }
}
