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
  let userId = (session?.user as any)?.id;

  await connectDB();

  if (!userId && process.env.NODE_ENV !== "production") {
    const { User } = await import("@/server/db/models/User");
    const firstUser = await User.findOne().lean();
    if (firstUser) {
      userId = (firstUser as any)._id.toString();
    }
  }

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await props.params;
  const { message, model, mode = "general" } = await req.json();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  // Verify conversation exists and belongs to user (auto-create if missing)
  let conversation = await Conversation.findOne({ conversationId, userId });
  if (!conversation) {
    conversation = await Conversation.create({
      conversationId,
      userId,
      title: "Voice Conversation",
    });
  }

  // Update lastMessageAt timestamp on conversation
  await Conversation.updateOne(
    { conversationId, userId },
    { $set: { lastMessageAt: new Date() } }
  );

  let userName = (session?.user as any)?.name;
  if (!userName && userId) {
    try {
      const { User } = await import("@/server/db/models/User");
      const userDoc = await User.findById(userId).select("name").lean();
      if (userDoc && (userDoc as any).name) {
        userName = (userDoc as any).name;
      }
    } catch (_) {}
  }

  // Delegate processing to the execution kernel conversation service
  try {
    const { LifeOSApplication } = await import("@life-os/execution-kernel");
    return await LifeOSApplication.conversation.executeUserRequest({
      userId,
      userName,
      conversationId,
      message,
      model,
      mode,
    });
  } catch (err: any) {
    console.error("POST /api/conversations/[id]/messages Error:", err);
    return Response.json(
      { error: err.message || "Failed to process message" },
      { status: 500 }
    );
  }
}

