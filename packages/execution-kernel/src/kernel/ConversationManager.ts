import mongoose from "mongoose";
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
  requestId?: string;
  executionId?: string;
  status?: "completed" | "cancelled" | "failed" | "waiting_for_confirmation";
  stmUpdates?: Record<string, any>;
  toolActivities?: any[];
  missingConnection?: any;
  confirmation?: any;
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
    if (mongoose.connection.readyState !== 1) {
      return { conversation: null, stm: null, recentMessages: [] };
    }
    const [conversation, stm, rawMessages] = await Promise.all([
      Conversation.findOne({ conversationId, userId }).lean(),
      ConversationShortTermMemory.findOne({ conversationId, userId }).lean(),
      ConversationMessage.find({ conversationId, userId })
        .sort({ createdAt: 1, _id: 1 })
        .select("role content createdAt requestId executionId status toolActivities missingConnection confirmation")
        .lean(),
    ]);

    const recentMessages = (rawMessages || []).map((m: any) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      createdAt: m.createdAt,
      requestId: m.requestId,
      executionId: m.executionId,
      status: m.status,
      toolActivities: m.toolActivities,
      missingConnection: m.missingConnection,
      confirmation: m.confirmation,
    }));

    return {
      conversation: (conversation as any) || null,
      stm: (stm as any) || null,
      recentMessages,
    };
  }

  async findPersistedAssistantByRequestId(
    userId: string,
    conversationId: string,
    requestId: string
  ): Promise<IConversationMessage | null> {
    if (!requestId || mongoose.connection.readyState !== 1) {
      return null;
    }
    return (await ConversationMessage.findOne({
      userId,
      conversationId,
      requestId,
      role: "assistant",
    }).lean()) as IConversationMessage | null;
  }

  /**
   * Persists user and assistant messages, updates conversation metadata,
   * persists updated Short-Term Memory state, and triggers async rolling summarization.
   */
  async persist(options: PersistOptions): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      return;
    }
    const {
      conversationId,
      userId,
      userMessage,
      assistantResponse,
      requestId,
      executionId,
      status,
      stmUpdates,
      toolActivities,
      missingConnection,
      confirmation,
    } = options;

    if (requestId) {
      const existing = await this.findPersistedAssistantByRequestId(userId, conversationId, requestId);
      if (existing) {
        return;
      }
    }

    const now = new Date();

    const userTokens = estimateTokens(userMessage);
    const assistantTokens = estimateTokens(assistantResponse);
    const totalNewTokens = userTokens + assistantTokens;

    // 1. Create message records sequentially with strictly monotonic timestamps
    // User message is always timestamped strictly before assistant message
    const userCreatedAt = new Date();
    const assistantCreatedAt = new Date(userCreatedAt.getTime() + 500);

    await ConversationMessage.create({
      conversationId,
      userId,
      role: "user",
      content: userMessage,
      requestId,
      tokenEstimate: userTokens,
      createdAt: userCreatedAt,
      updatedAt: userCreatedAt,
    });

    await ConversationMessage.create({
      conversationId,
      userId,
      role: "assistant",
      content: assistantResponse,
      requestId,
      executionId,
      status: status || "completed",
      tokenEstimate: assistantTokens,
      toolActivities,
      missingConnection,
      confirmation,
      createdAt: assistantCreatedAt,
      updatedAt: assistantCreatedAt,
    });

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
