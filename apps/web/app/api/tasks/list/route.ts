import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { Task } from "@/server/db/models/Task";
import { getActiveDate } from "@/server/automation/timeUtils";
import { User } from "@/server/db/models/User";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);

  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;
  const today = getActiveDate(timezone);

  const filter = searchParams.get("filter") || "all"; // today | upcoming | overdue | all

  let query: any = { userId };

  if (filter === "today") {
    query.dueDate = today;
  } else if (filter === "upcoming") {
    const future = new Date(today);
    future.setDate(future.getDate() + 7);
    query.dueDate = { $gt: today, $lte: future.toISOString().slice(0, 10) };
    query.status = "pending";
  } else if (filter === "overdue") {
    query.dueDate = { $lt: today };
    query.status = "pending";
  }
  // "all" → no extra filter

  const tasks = await Task.find(query)
    .sort({ priority: -1, dueDate: 1, dueTime: 1 })
    .lean();

  // Group into sections
  const overdue = tasks.filter((t) => t.dueDate < today && t.status === "pending");
  const todayTasks = tasks.filter((t) => t.dueDate === today);
  const upcoming = tasks.filter((t) => t.dueDate > today);

  return NextResponse.json({ ok: true, today: todayTasks, overdue, upcoming, all: tasks });
}
