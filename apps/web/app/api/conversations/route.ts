import { NextRequest } from "next/server";
import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { Conversation } from "@/server/db/models/Conversation";
import { ConversationShortTermMemory } from "@/server/db/models/ConversationShortTermMemory";

/**
 * GET /api/conversations
 * Lists all conversations for the authenticated user, sorted by last activity.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const { searchParams } = new URL(req.url);
  const archived = searchParams.get("archived") === "true";

  await connectDB();

  const conversations = await Conversation.find({ userId, archived })
    .sort({ lastMessageAt: -1 })
    .select(
      "conversationId title archived pinned messageCount lastMessageAt createdAt updatedAt"
    )
    .lean();

  return Response.json(conversations);
}

/**
 * POST /api/conversations
 * Creates a new conversation for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!(session?.user as any)?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session!.user as any).id;
  const body = await req.json().catch(() => ({}));
  const title: string = body.title?.trim() || "New Conversation";

  await connectDB();

  const conversation = await Conversation.create({ userId, title });

  // Initialise empty STM for the new conversation
  await ConversationShortTermMemory.create({
    conversationId: conversation.conversationId,
    userId,
  });

  console.log(
    `💬 [CONVERSATIONS] Created conversation ${conversation.conversationId} for user ${userId}`
  );

  return Response.json(
    {
      conversationId: conversation.conversationId,
      title: conversation.title,
      createdAt: conversation.createdAt,
    },
    { status: 201 }
  );
}
