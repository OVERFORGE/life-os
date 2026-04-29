import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { completeTask, skipTask, skipAllForToday } from "@/features/tasks/engine/taskEngine";
import { updateGoalStats } from "@/features/goals/engine/updateGoalStats";
import { User } from "@/server/db/models/User";

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { taskId, action = "complete", skipAll = false } = await req.json();

  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // Handle bulk-skip (e.g. "skip all tasks today")
  if (skipAll) {
    const result = await skipAllForToday(userId, timezone);
    return NextResponse.json(result);
  }

  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  let result;
  if (action === "skip") {
    result = await skipTask(userId, taskId);
  } else {
    result = await completeTask(userId, taskId, timezone);
    // Refresh goal scores if task was linked to a goal
    if (result.success && (result.task as any)?.goalId) {
      await updateGoalStats(userId).catch(() => {});
    }
  }

  return NextResponse.json(result);
}
