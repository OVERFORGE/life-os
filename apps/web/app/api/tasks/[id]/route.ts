import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { Task } from "@/server/db/models/Task";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  
  try {
    const { id } = await params;
    const task = await Task.findOne({ _id: id, userId: (session.user as any).id }).lean();
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}
