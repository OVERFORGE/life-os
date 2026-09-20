import { DefaultLLMProvider, LLMProvider } from "../shared/llmAdapter";
import { Conversation } from "@/server/db/models/Conversation";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";

export const SUMMARIZER_CONFIG = {
  SUMMARY_TRIGGER_MESSAGE_COUNT: 40,
  SUMMARY_KEEP_RECENT: 20,
} as const;

/**
 * ConversationSummarizer
 * 
 * SOLE OWNER of rolling conversation summarization.
 * Compresses older dialogue into a compact, evolving summary string.
 * 
 * MUST NOT:
 * - Call Planner
 * - Execute actions
 * - Mutate Brain
 * - Rank memories
 * - Block response stream
 */
export class ConversationSummarizer {
  private static instance: ConversationSummarizer;

  constructor(private llmProvider: LLMProvider = DefaultLLMProvider.getInstance()) {}

  static getInstance(): ConversationSummarizer {
    if (!ConversationSummarizer.instance) {
      ConversationSummarizer.instance = new ConversationSummarizer();
    }
    return ConversationSummarizer.instance;
  }

  /**
   * Checks if conversation exceeds summary threshold and triggers background summarization.
   */
  async checkAndSummarize(conversationId: string, userId: string): Promise<void> {
    try {
      const conversation = await Conversation.findOne({ conversationId, userId });
      if (!conversation) return;

      if (conversation.messageCount < SUMMARIZER_CONFIG.SUMMARY_TRIGGER_MESSAGE_COUNT) {
        return;
      }

      // Fetch all messages for the conversation
      const allMessages = await ConversationMessage.find({ conversationId, userId })
        .sort({ createdAt: 1 })
        .lean();

      if (allMessages.length <= SUMMARIZER_CONFIG.SUMMARY_KEEP_RECENT) {
        return;
      }

      // Messages to summarize: all except the newest SUMMARY_KEEP_RECENT
      const sliceIndex = allMessages.length - SUMMARIZER_CONFIG.SUMMARY_KEEP_RECENT;
      const olderMessages = allMessages.slice(0, sliceIndex);
      const lastMessage = olderMessages[olderMessages.length - 1];

      // Check staleness using metadata
      if (
        conversation.lastSummarizedMessageId &&
        conversation.lastSummarizedMessageId === (lastMessage as any)._id?.toString()
      ) {
        return; // Already up to date for this slice
      }

      // Throttle: if summary exists, only re-summarize if at least 5 minutes have elapsed
      if (conversation.summary && conversation.lastSummarizedAt) {
        const minutesSinceLast = (Date.now() - new Date(conversation.lastSummarizedAt).getTime()) / (1000 * 60);
        if (minutesSinceLast < 5) {
          return; // Skip summarization until at least 5 minutes have passed
        }
      }

      // Cap to the last 25 messages of the older slice to prevent 429 token rate limits on long histories
      const recentOlderMessages = olderMessages.slice(-25);
      const dialogueToSummarize = recentOlderMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      console.log(
        `📝 [SUMMARIZER] Generating rolling summary for conversation ${conversationId} (${recentOlderMessages.length} of ${olderMessages.length} older messages)...`
      );

      const updatedSummary = await this.generateSummary(
        conversation.summary || "",
        dialogueToSummarize
      );

      // Update Conversation record
      await Conversation.updateOne(
        { conversationId, userId },
        {
          $set: {
            summary: updatedSummary,
            lastSummarizedAt: new Date(),
            lastSummarizedMessageId: (lastMessage as any)._id?.toString(),
          },
        }
      );

      console.log(`✅ [SUMMARIZER] Updated summary for conversation ${conversationId}`);
    } catch (err) {
      console.warn("[SUMMARIZER] Summary pass deferred:", (err as any)?.message || err);
      // Mark as summarized to prevent infinite back-to-back retries from consuming token quota
      try {
        const { Conversation } = await import("@/server/db/models/Conversation");
        await Conversation.updateOne(
          { conversationId, userId },
          { $set: { lastSummarizedAt: new Date() } }
        );
      } catch (_) {}
    }
  }

  /**
   * Generates a rolling summary using the fast LLM model.
   */
  private async generateSummary(existingSummary: string, dialogue: string): Promise<string> {
    const systemPrompt = `You are a conversation summarizer for LifeOS, a personal AI operating system.
Your task is to produce a concise, structured rolling summary of the user's ongoing conversation.

PRESERVE:
- User preferences, goals, and nutrition/fitness modes
- Important decisions, commitments, and user corrections
- Unresolved questions and ongoing workflows
- Long-term plans and key facts about the user

DISCARD:
- Casual greetings, filler, and fluff
- Repeated explanations and system instructions
- Transient status updates that are no longer relevant

FORMAT:
Write a bulleted summary using concise statements. Keep under 300 words.`;

    const userPrompt = `${existingSummary ? `[EXISTING SUMMARY]:\n${existingSummary}\n\n` : ""}[DIALOGUE TO INCORPORATE]:\n${dialogue}`;

    try {
      // Use verified fast model for background summarization
      const summary = await this.llmProvider.chat(
        userPrompt,
        systemPrompt,
        "qwen/qwen3.8-27b"
      );
      return summary.trim();
    } catch (err) {
      console.warn("[SUMMARIZER] LLM summary generation deferred:", err);
      return existingSummary;
    }
  }
}
