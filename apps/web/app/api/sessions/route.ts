import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { Session } from "@/server/db/models/Session";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const currentSessionId = (session as any).sessionId;

  const sessions = await Session.find({
    userId,
    isRevoked: false,
  })
    .sort({ lastActive: -1 })
    .lean();

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: String(s._id),
      deviceType: s.deviceType,
      platform: s.platform,
      browser: s.browser,
      os: s.os,
      ipAddress: s.ipAddress,
      lastActive: s.lastActive,
      createdAt: s.createdAt,
      isCurrent: s.sessionToken === currentSessionId,
    })),
    currentSessionId,
  });
}
