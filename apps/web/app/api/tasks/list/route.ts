import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { Task } from "@/server/db/models/Task";
import { getActiveDate } from "@life-os/execution-kernel";
import { User } from "@/server/db/models/User";
import mongoose from "mongoose";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);

  const user = await User.findById(userId).select("settings").lean();
  const timezone =
    req.headers.get("x-timezone") ||
    searchParams.get("timezone") ||
    (user as any)?.settings?.timezone ||
    "UTC";
  const today = getActiveDate(timezone);

  const filter = searchParams.get("filter") || "all"; // today | upcoming | overdue | all

  const userObjId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : null;
  const userMatcher = userObjId
    ? { $in: [userId, userObjId, String(userId)] }
    : userId;

  const query: any = { userId: userMatcher };

  if (filter === "today") {
    query.dueDate = today;
  } else if (filter === "upcoming") {
    const future = new Date(today);
    future.setDate(future.getDate() + 7);
    query.dueDate = { $gt: today, $lte: future.toISOString().slice(0, 10) };
    query.status = { $ne: "completed" };
  } else if (filter === "overdue") {
    query.dueDate = { $lt: today };
    query.status = { $ne: "completed" };
  }
  // "all" → no extra filter

  const tasks = await Task.find(query)
    .sort({ priority: -1, dueDate: 1, dueTime: 1, createdAt: -1 })
    .lean();

  // Group into sections
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const waiting = tasks.filter((t) => t.status === "waiting" || t.status === "blocked");
  const completed = tasks.filter((t) => t.status === "completed");
  const overdue = tasks.filter((t) => t.dueDate < today && t.status !== "completed");
  const todayTasks = tasks.filter((t) => t.dueDate === today);
  const upcoming = tasks.filter((t) => t.dueDate > today);
  const pending = tasks.filter(
    (t) => (!t.status || t.status === "pending") && t.status !== "completed"
  );

  return NextResponse.json({
    ok: true,
    today: todayTasks,
    overdue,
    upcoming,
    inProgress,
    waiting,
    completed,
    pending,
    all: tasks,
  });
}
