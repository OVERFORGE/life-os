import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { Habit } from "@/server/db/models/Habit";
import { getAuthSession } from "@/lib/auth";
import mongoose from "mongoose";

function getUserIdMatcher(userId: string) {
  const matchers: any[] = [userId, String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    matchers.push(new mongoose.Types.ObjectId(userId));
  }
  return { $in: matchers };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    let targetDate = new Date().toISOString().split("T")[0];

    try {
      const body = await req.json();
      if (body?.date) targetDate = body.date;
    } catch {
      // Body may be empty, defaults to today
    }

    await connectDB();
    const userId = session.user.id;

    const habit = await Habit.findOne({
      _id: id,
      userId: getUserIdMatcher(userId),
    });

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    const recentDays = habit.recentDays || [];
    const existingIndex = recentDays.findIndex((d: any) => d.date === targetDate);

    let nextCompleted = true;
    if (existingIndex >= 0) {
      nextCompleted = !recentDays[existingIndex].completed;
      recentDays[existingIndex].completed = nextCompleted;
    } else {
      recentDays.push({ date: targetDate, completed: true });
    }

    // Sort recent days by date ascending
    recentDays.sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Calculate streak
    let streak = 0;
    for (let i = recentDays.length - 1; i >= 0; i--) {
      if (recentDays[i].completed) {
        streak++;
      } else {
        break;
      }
    }

    habit.recentDays = recentDays;
    habit.streak = streak;
    await habit.save();

    return NextResponse.json({
      ok: true,
      habit: { ...habit.toObject(), id: String(habit._id) },
      completed: nextCompleted,
      streak,
    });
  } catch (err: any) {
    console.error("POST /api/habits/[id]/toggle error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
