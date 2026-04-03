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
    .sort({ createdAt: 1 })
    .lean();

  return Response.json(messages);
}