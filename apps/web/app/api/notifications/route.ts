import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { NotificationLog } from "@/server/db/models/Notification";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const notifications = await NotificationLog.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    return Response.json({ notifications });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    await NotificationLog.updateMany(
      { userId: session.user.id, read: false },
      { $set: { read: true } }
    );

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
