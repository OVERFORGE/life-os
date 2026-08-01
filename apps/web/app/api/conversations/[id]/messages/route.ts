import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Conversation } from "@/server/db/models/Conversation";
import { Kernel } from "@life-os/execution-kernel";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/conversations/[id]/messages
 * Primary message endpoint for a specific conversation.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  const session = await getAuthSession();

  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { id: conversationId } = await props.params;
  const { message, model, mode = "general" } = await req.json();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  await connectDB();

  // Verify conversation exists and belongs to user
  const conversation = await Conversation.findOne({ conversationId, userId });
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Update lastMessageAt timestamp on conversation
  await Conversation.updateOne(
    { conversationId, userId },
    { $set: { lastMessageAt: new Date() } }
  );

  // Delegate processing to the execution kernel, forwarding conversationId
  return await Kernel.handle({
    userId,
    conversationId,
    message,
    model,
    mode,
  });
}
