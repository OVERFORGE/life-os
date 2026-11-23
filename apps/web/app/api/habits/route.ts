import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { Habit } from "@/server/db/models/Habit";
import { Goal } from "@/features/goals/models/Goal";
import { getAuthSession } from "@/lib/auth";
import mongoose from "mongoose";

function getUserIdMatcher(userId: string) {
  const matchers: any[] = [userId, String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    matchers.push(new mongoose.Types.ObjectId(userId));
  }
  return { $in: matchers };
}

function getPastDates(numDays = 5): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const userId = session.user.id;
    const filter = { userId: getUserIdMatcher(userId), status: "active" };

    let habits = await Habit.find(filter).sort({ order: 1, createdAt: 1 }).lean();

    // If user has zero habits, seed default initial supporting habits
    if (habits.length === 0) {
      const pastDates = getPastDates(5);
      const userGoals = await Goal.find({ userId: getUserIdMatcher(userId), status: "active" }).lean();
      const lifeOsGoal = userGoals.find((g: any) => g.title?.toLowerCase().includes("lifeos") || g.title?.toLowerCase().includes("infra")) || userGoals[0];
      const healthGoal = userGoals.find((g: any) => g.title?.toLowerCase().includes("fit") || g.title?.toLowerCase().includes("health")) || userGoals[1] || userGoals[0];

      const initialHabits = [
        {
          userId: String(userId),
          title: "Deep Work Focus Block · 4.5h",
          frequency: "Mon–Fri",
          supportingGoalId: lifeOsGoal ? String(lifeOsGoal._id) : undefined,
          supportingGoalTitle: lifeOsGoal ? `Supports ${lifeOsGoal.title}` : "Supports Core Infra 2.0",
          category: "work",
          status: "active",
          targetDaysPerWeek: 5,
          streak: 4,
          recentDays: [
            { date: pastDates[0], completed: true },
            { date: pastDates[1], completed: true },
            { date: pastDates[2], completed: true },
            { date: pastDates[3], completed: true },
            { date: pastDates[4], completed: false },
          ],
          order: 0,
        },
        {
          userId: String(userId),
          title: "Evening Reflection & Shutdown",
          frequency: "Daily",
          supportingGoalId: healthGoal ? String(healthGoal._id) : undefined,
          supportingGoalTitle: healthGoal ? `Supports ${healthGoal.title}` : "Supports Restorative Health",
          category: "health",
          status: "active",
          targetDaysPerWeek: 7,
          streak: 5,
          recentDays: [
            { date: pastDates[0], completed: true },
            { date: pastDates[1], completed: true },
            { date: pastDates[2], completed: true },
            { date: pastDates[3], completed: true },
            { date: pastDates[4], completed: true },
          ],
          order: 1,
        },
        {
          userId: String(userId),
          title: "Weekly Architecture Review",
          frequency: "Every Friday",
          supportingGoalId: lifeOsGoal ? String(lifeOsGoal._id) : undefined,
          supportingGoalTitle: lifeOsGoal ? `Supports ${lifeOsGoal.title}` : "Supports Core Infra 2.0",
          category: "work",
          status: "active",
          targetDaysPerWeek: 1,
          streak: 3,
          recentDays: [
            { date: pastDates[0], completed: true },
            { date: pastDates[1], completed: true },
            { date: pastDates[2], completed: true },
            { date: pastDates[3], completed: true },
            { date: pastDates[4], completed: false },
          ],
          order: 2,
        },
      ];

      await Habit.insertMany(initialHabits);
      habits = await Habit.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    }

    // Ensure 5 recent days are aligned to current date
    const todayStr = new Date().toISOString().split("T")[0];
    const last5Dates = getPastDates(5);

    const formatted = habits.map((h: any) => {
      const historyMap = new Map((h.recentDays || []).map((d: any) => [d.date, d.completed]));
      const normalizedRecent = last5Dates.map((date) => ({
        date,
        completed: Boolean(historyMap.get(date)),
      }));

      return {
        ...h,
        id: String(h._id),
        recentDays: normalizedRecent,
        isCompletedToday: Boolean(historyMap.get(todayStr)),
      };
    });

    return NextResponse.json(formatted);
  } catch (err: any) {
    console.error("GET /api/habits error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    await connectDB();
    const userId = session.user.id;
    const pastDates = getPastDates(5);

    const habit = await Habit.create({
      userId: String(userId),
      title: body.title.trim(),
      frequency: body.frequency || "Daily",
      supportingGoalId: body.supportingGoalId || null,
      supportingGoalTitle: body.supportingGoalTitle || "",
      category: body.category || "routine",
      status: "active",
      targetDaysPerWeek: Number(body.targetDaysPerWeek) || 5,
      streak: 0,
      recentDays: pastDates.map((d) => ({ date: d, completed: false })),
      order: Date.now(),
    });

    return NextResponse.json({ ok: true, habit: { ...habit.toObject(), id: String(habit._id) } }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/habits error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
