import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { LifeOSApplication } from "@life-os/execution-kernel";
import { apiSuccess, apiError } from "@/lib/apiResponse";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId") || "default";

    await connectDB();

    const conversationDTO = await LifeOSApplication.conversation.getConversation(conversationId, userId);
    return apiSuccess(conversationDTO);
  } catch (err: any) {
    console.error("GET /api/conversation Error:", err);
    return apiError(err.message || "Failed to fetch conversation DTO", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    if (!userId && process.env.NODE_ENV !== "production") {
      await connectDB();
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { message, model, mode = "general" } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return apiError("Message string is required", "BAD_REQUEST", 400);
    }

    await connectDB();

    // Stream execution response directly from LifeOSApplication.conversation
    return await LifeOSApplication.conversation.executeUserRequest({
      userId,
      message,
      model,
      mode,
    });
  } catch (err: any) {
    console.error("POST /api/conversation Error:", err);
    return apiError(err.message || "Failed to execute conversation request", "INTERNAL_ERROR", 500);
  }
}