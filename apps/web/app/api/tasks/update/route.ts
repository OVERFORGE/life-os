import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { updateTask } from "@/features/tasks/engine/taskEngine";

async function handler(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { taskId, ...updates } = await req.json();

  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const result = await updateTask(userId, taskId, updates);
  return NextResponse.json(result);
}

export const PATCH = handler;
export const POST = handler;
