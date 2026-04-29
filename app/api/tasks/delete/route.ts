import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { deleteTask } from "@/features/tasks/engine/taskEngine";

export async function DELETE(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { taskId } = await req.json();

  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const result = await deleteTask(userId, taskId);
  return NextResponse.json(result);
}
