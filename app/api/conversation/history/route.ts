import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/server/db/connect";
import { ConversationMessage } from "@/server/db/models/ConversationMessage";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json([], { status: 401 });
  }

  await connectDB();

  const messages = await ConversationMessage.find({
    userId: session.user.id,
  })
    .sort({ createdAt: 1 })
    .lean();

  return Response.json(messages);
}