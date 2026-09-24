import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { getAuthSession } from "@/lib/auth";

export async function GET() {
  const session = await getAuthSession();

  if (!(session?.user as any)?.id) {
    return Response.json([], { status: 401 });
  }

  await connectDB();

  const messages = await ConversationMessage.find({
    userId: (session!.user as any).id,
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  // Defensive chronological order: user message always precedes assistant message on identical timestamp
  messages.sort((a: any, b: any) => {
    const tA = new Date(a.createdAt).getTime();
    const tB = new Date(b.createdAt).getTime();
    if (tA !== tB) return tA - tB;
    if (a.role === "user" && b.role === "assistant") return -1;
    if (a.role === "assistant" && b.role === "user") return 1;
    return 0;
  });

  return Response.json(messages);
}