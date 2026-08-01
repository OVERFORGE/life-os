import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Conversation } from "@/server/db/models/Conversation";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { ConversationShortTermMemory } from "@/server/db/models/ConversationShortTermMemory";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/conversations/[id]
 * Returns conversation metadata + message history.
 */
export async function GET(_req: NextRequest, props: RouteParams) {
  const session = await getAuthSession();
  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { id: conversationId } = await props.params;

  await connectDB();

  const conversation = await Conversation.findOne({
    conversationId,
    userId,
  }).lean();

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await ConversationMessage.find({ conversationId, userId })
    .sort({ createdAt: 1 })
    .select("role content createdAt tokenEstimate")
    .lean();

  return Response.json({ ...conversation, messages });
}

/**
 * PATCH /api/conversations/[id]
 * Updates conversation title, archived, or pinned state.
 */
export async function PATCH(req: NextRequest, props: RouteParams) {
  const session = await getAuthSession();
  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { id: conversationId } = await props.params;
  const body = await req.json().catch(() => ({}));

  // Only allow these fields to be patched
  const allowed = ["title", "archived", "pinned"] as const;
  const updates: Partial<Record<(typeof allowed)[number], any>> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await connectDB();

  const updated = await Conversation.findOneAndUpdate(
    { conversationId, userId },
    { $set: updates },
    { new: true }
  ).lean();

  if (!updated) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  return Response.json({ success: true, conversation: updated });
}

/**
 * DELETE /api/conversations/[id]
 * Permanently deletes a conversation including all messages and STM state.
 */
export async function DELETE(_req: NextRequest, props: RouteParams) {
  const session = await getAuthSession();
  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { id: conversationId } = await props.params;

  await connectDB();

  const conversation = await Conversation.findOne({ conversationId, userId });
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Delete in parallel: messages, STM, and conversation record
  await Promise.all([
    ConversationMessage.deleteMany({ conversationId, userId }),
    ConversationShortTermMemory.deleteOne({ conversationId, userId }),
    Conversation.deleteOne({ conversationId, userId }),
  ]);

  console.log(
    `🗑️  [CONVERSATIONS] Deleted conversation ${conversationId} for user ${userId}`
  );

  return Response.json({ success: true });
}
