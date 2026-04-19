import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { getAuthSession } from "@/lib/auth";

import { detectIntent } from "@/server/llm/intentRouter";
import { buildContext } from "@/server/llm/contextBuilder";
import { shouldCallTool } from "@/server/llm/toolRouter";
import { generateResponse } from "@/server/llm/reasoningModel";
import { executeTool } from "@/features/assistant/executor";
import { loadSystemContext } from "@/features/systemContext/loadSystemContext";

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { message, model } = await req.json();

  await connectDB();

  /* ===================================================== */
  /* 1. INTENT DETECTION                                  */
  /* ===================================================== */
  
  const recentMessages = await ConversationMessage.find({ userId })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();
  recentMessages.reverse();
  const historyText = recentMessages.map((m: any) => `${m.role}: ${m.content}`).join("\n");

  const intentResult = await detectIntent(message, historyText, model);
  const intents = intentResult.intents || ["casual_chat"];
  
  /* ===================================================== */
  /* 2. TOOL ROUTING & EXECUTION                          */
  /* ===================================================== */

  let toolResults: any[] = [];
  
  // Preserve existing system context for tools
  const systemContext = await loadSystemContext(userId);

  for (const intent of intents) {
    if (shouldCallTool(intent)) {
      const result = await executeTool({
        tool: intent,
        message,
        context: systemContext,
        userId,
      });
      toolResults.push({ intent, result });
    }
  }

  /* ===================================================== */
  /* 3. CONTEXT BUILDING (INTELLIGENCE LAYER)             */
  /* ===================================================== */

  const intelContext = await buildContext({ intents, userId, input: message });

  /* ===================================================== */
  /* 4. REASONING MODEL (STREAMING)                       */
  /* ===================================================== */

  const groqStream = await generateResponse({ 
      input: message, 
      context: intelContext, 
      toolResults,
      model 
  });

  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";

      try {
        for await (const chunk of groqStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            controller.enqueue(
              new TextEncoder().encode(content)
            );
          }
        }
      } catch (err) {
        console.error("Groq Stream Error:", err);
      }

      controller.close();

      /* SAVE TO HISTORY */
      await ConversationMessage.create({
        userId,
        role: "user",
        content: message,
      });

      await ConversationMessage.create({
        userId,
        role: "assistant",
        content: fullResponse,
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}