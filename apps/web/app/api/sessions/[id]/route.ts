import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { Session } from "@/server/db/models/Session";

// DELETE /api/sessions/[id] — revoke a specific session (remote logout)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { id } = await params;

  // Only allow revoking sessions that belong to this user
  const target = await Session.findOne({ _id: id, userId });
  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await Session.findByIdAndUpdate(id, { isRevoked: true });

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/all — revoke all other sessions
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const currentSessionId = (session as any).sessionId;
  const body = await req.json().catch(() => ({}));

  if (body.revokeAll) {
    // Revoke all sessions except the current one
    await Session.updateMany(
      { userId, sessionToken: { $ne: currentSessionId }, isRevoked: false },
      { isRevoked: true }
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
