import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";

import { loadSystemContext } from "@/features/systemContext/loadSystemContext";
import { buildPrompt } from "@/features/conversation/buildPrompt";
import { runAssistantBrain } from "@/features/assistant/brain";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { message } = await req.json();

  await connectDB();

  /* ---------------- HISTORY ---------------- */

  const history = await ConversationMessage.find({ userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  /* ---------------- CONTEXT ---------------- */

  const context = await loadSystemContext(userId);

  /* ---------------- BRAIN ---------------- */

  const brainResult = await runAssistantBrain({
    message,
    context,
    userId,
  });
  console.log("BRAIN RESULT:", brainResult);
  /* ===================================================== */
  /* 🧠 PROMPT BUILDING                                   */
  /* ===================================================== */

  let finalPrompt = "";

  /* 🟢 TOOL EXECUTED */

  if (brainResult.type === "tool_executed") {
    finalPrompt = `
You are LifeOS, a human-like intelligent assistant.

The user said:
"${message}"

System action result:
${JSON.stringify(brainResult.result)}

IMPORTANT:
- Only confirm success if success=true
- If failed, explain honestly
- Do NOT assume anything
- Do NOT mention JSON or tools

Respond naturally like a human.
`;
  }

  /* 🟡 CONFIRMATION STEP */

  else if (brainResult.type === "confirmation_required") {
    finalPrompt = `
The user said:
"${message}"

They want to create a goal.

Your job:
- Understand the intent
- Rephrase it clearly
- Explain what will happen
- Ask for confirmation

DO NOT create the goal yet.

Example tone:

"That sounds like a strong habit to build.

I can set this up as a daily goal where your consistency gets tracked over time. This will help improve your discipline and energy levels.

Do you want me to create this goal for you?"
`;
  }

  /* 🔵 NORMAL CHAT */

  else {
    finalPrompt = buildPrompt(
      context,
      history.reverse(),
      message
    );
  }

  /* ===================================================== */
  /* 🤖 LLM CALL                                          */
  /* ===================================================== */

  const ollamaRes = await fetch("http://localhost:11434/api/generate", {
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
  });

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
        } catch { }
      }

      controller.close();

      /* SAVE */

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