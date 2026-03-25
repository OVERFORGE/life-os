import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";

import { loadSystemContext } from "@/features/systemContext/loadSystemContext";
import { buildPrompt } from "@/features/conversation/buildPrompt";

// ✅ NEW
import { runAssistantBrain } from "@/features/assistant/brain";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { message } = await req.json();

  await connectDB();

  /* ---------------- LOAD HISTORY ---------------- */

  const history = await ConversationMessage.find({
    userId,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  /* ---------------- LOAD CONTEXT ---------------- */

  const context = await loadSystemContext(userId);

  /* ===================================================== */
  /* 🧠 RUN ASSISTANT BRAIN                               */
  /* ===================================================== */

  const brainResult = await runAssistantBrain({
    message,
    context,
    userId,
  });

  /* ===================================================== */
  /* 🧠 BUILD FINAL PROMPT                                */
  /* ===================================================== */

  let finalPrompt = `
    You are LifeOS, an intelligent personal operating system.

    The user said:
    "${message}"

    You executed this action:
    ${brainResult.tool}

    Execution result:
    ${JSON.stringify(brainResult.result)}

    IMPORTANT RULES:
    - ONLY describe what actually happened based on the result above
    - DO NOT assume failure if success=true
    - DO NOT hallucinate missing data
    - Be confident and clear

    Then:
    - confirm action
    - explain briefly
    - ask a useful follow-up

    Keep tone natural and human.
    `;

  if (brainResult.type === "tool_executed") {
    finalPrompt = `
You are LifeOS, an intelligent personal operating system.

The user said:
"${message}"

You executed the action:
${brainResult.tool}

Result:
${JSON.stringify(brainResult.result)}

Now respond naturally:
- confirm what you did
- explain briefly
- keep tone human and intelligent
- suggest next step if relevant
    `;
  } else {
    finalPrompt = buildPrompt(
      context,
      history.reverse(),
      message
    );
  }

  /* ===================================================== */
  /* 🤖 CALL LLM (STREAMING)                              */
  /* ===================================================== */

  const ollamaRes = await fetch(
    "http://localhost:11434/api/generate",
    {
      method: "POST",
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt: finalPrompt,
        stream: true,
        options: {
          temperature: 0.8,
          num_predict: 350,
          top_p: 0.9,
        },
      }),
    }
  );

  if (!ollamaRes.body) {
    return Response.json({ error: "No response" });
  }

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();

  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);

        try {
          const parsed = JSON.parse(chunk);

          if (parsed.response) {
            fullResponse += parsed.response;

            controller.enqueue(
              new TextEncoder().encode(parsed.response)
            );
          }
        } catch {
          // ignore bad chunk
        }
      }

      controller.close();

      /* ---------------- SAVE ---------------- */

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