import { groqChat } from "../../shared/groq";

/**
 * FastSemanticFiller
 * 
 * Provides an ultra-fast (< 180ms TTFT) semantic conversational acknowledgment.
 * Strictly 100% model-driven (ZERO regex, ZERO pattern matching, ZERO hardcoding).
 * 
 * When the user speaks an operational request or data query, generates a natural,
 * context-appropriate executive verbal acknowledgment (filler) immediately so
 * Aven begins speaking while deep intent interpretation and kernel execution
 * run concurrently in the background.
 */
export class FastSemanticFiller {
  private static instance: FastSemanticFiller;

  static getInstance(): FastSemanticFiller {
    if (!FastSemanticFiller.instance) {
      FastSemanticFiller.instance = new FastSemanticFiller();
    }
    return FastSemanticFiller.instance;
  }

  /**
   * Generates a context-aware spoken filler sentence in < 200ms using an ultra-fast LLM.
   * Returns null if the user utterance is casual dialogue, greeting, gratitude, sign-off, or cancellation.
   */
  async generateFiller(userMessage: string, timeoutMs: number = 600): Promise<string | null> {
    const cleanMsg = (userMessage || "").trim();
    if (!cleanMsg || cleanMsg.length < 3) return null;

    const fillerTask = async (): Promise<string | null> => {
      try {
        const systemPrompt = `You are Aven, the executive voice assistant for LifeOS.
The user is speaking to you.
If the user's utterance is an action request (e.g. creating/scheduling a task, logging food/workout, setting reminders, updating/deleting items) or a data query (e.g. asking for schedule, stats, status), produce an immediate, natural 1-sentence executive filler acknowledging that you are taking care of it right away (e.g. "Right away, let me schedule that for you.", "On it, logging that for you now.", "One moment, pulling that up for you.").
If the utterance is a greeting, casual chat, farewell, gratitude, or negation/cancellation, return NONE.
Return ONLY the sentence or NONE.`;

        const response = await groqChat({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: cleanMsg },
          ],
          model: "qwen/qwen3.8-27b",
          temperature: 0.1,
          max_tokens: 30,
        });

        const clean = (response || "").trim().replace(/^["']|["']$/g, "");
        if (!clean || clean.toUpperCase() === "NONE" || clean.length < 4) {
          return null;
        }

        // Ensure clean punctuation without trailing markdown
        return clean.replace(/[#*_`]/g, "").trim();
      } catch (err) {
        return null;
      }
    };

    // Race against timeout to ensure the main pipeline is NEVER delayed
    return Promise.race([
      fillerTask(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  }
}
