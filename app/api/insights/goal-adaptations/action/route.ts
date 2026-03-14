import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { GoalHistory } from "@/server/db/models/GoalHistory";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const { goalId, action, suggestedChange } = body;

  await connectDB();

  if (action === "dismiss") {
    return Response.json({ ok: true });
  }

  if (action === "approve" && suggestedChange) {
    const goal = await Goal.findOne({
      _id: goalId,
      userId: session.user.id,
    });

    if (!goal) {
      return Response.json({ error: "Goal not found" }, { status: 404 });
    }

    const previousValue = goal[suggestedChange.field];

    goal[suggestedChange.field] = suggestedChange.to;

    await goal.save();

    await GoalHistory.create({
      goalId,
      userId: session.user.id,
      type: "adaptation",
      field: suggestedChange.field,
      from: previousValue,
      to: suggestedChange.to,
      date: new Date(),
    });

    return Response.json({ ok: true });
  }

  return Response.json({ ok: false });
}