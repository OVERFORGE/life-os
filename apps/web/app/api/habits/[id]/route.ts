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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();

    await connectDB();
    const userId = session.user.id;

    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.frequency !== undefined) updates.frequency = body.frequency;
    if (body.supportingGoalTitle !== undefined) updates.supportingGoalTitle = body.supportingGoalTitle;
    if (body.supportingGoalId !== undefined) updates.supportingGoalId = body.supportingGoalId;
    if (body.category !== undefined) updates.category = body.category;
    if (body.status !== undefined) updates.status = body.status;
    if (body.targetDaysPerWeek !== undefined) updates.targetDaysPerWeek = Number(body.targetDaysPerWeek);

    const habit = await Habit.findOneAndUpdate(
      { _id: id, userId: getUserIdMatcher(userId) },
      { $set: updates },
      { new: true }
    );

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, habit: { ...habit.toObject(), id: String(habit._id) } });
  } catch (err: any) {
    console.error("PATCH /api/habits/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export { PATCH as PUT };

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await connectDB();
    const userId = session.user.id;

    const habit = await Habit.findOneAndUpdate(
      { _id: id, userId: getUserIdMatcher(userId) },
      { $set: { status: "archived" } },
      { new: true }
    );

    if (!habit) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, archived: true });
  } catch (err: any) {
    console.error("DELETE /api/habits/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
