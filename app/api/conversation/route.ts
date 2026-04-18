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
  const { message } = await req.json();

  await connectDB();

  /* ===================================================== */
  /* 1. INTENT DETECTION                                  */
  /* ===================================================== */
  
  const intentResult = await detectIntent(message);
  const intent = intentResult.intent || "casual_chat";
  
  /* ===================================================== */
  /* 2. TOOL ROUTING & EXECUTION                          */
  /* ===================================================== */

  let toolResult = null;
  if (shouldCallTool(intent)) {
    // Preserve existing system context for tools
    const systemContext = await loadSystemContext(userId);
    toolResult = await executeTool({
      tool: intent,
      message,
      context: systemContext,
      userId,
    });
  }

  /* ===================================================== */
  /* 3. CONTEXT BUILDING (INTELLIGENCE LAYER)             */
  /* ===================================================== */

  const intelContext = await buildContext({ intent, userId, input: message });

  /* ===================================================== */
  /* 4. REASONING MODEL (STREAMING)                       */
  /* ===================================================== */

  const groqStream = await generateResponse({ 
      input: message, 
      context: intelContext, 
      toolResult 
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