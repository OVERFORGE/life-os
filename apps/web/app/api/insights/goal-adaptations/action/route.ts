import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Goal } from "@/features/goals/models/Goal";
import { GoalHistory } from "@/server/db/models/GoalHistory";
import { goalEngine } from "@/features/goals/engine/goalEngine";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: any = await req.json();

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

    const previousValue = (goal as any)[suggestedChange.field];

    const result = await goalEngine.updateGoal(
      session.user.id,
      goalId,
      { [suggestedChange.field]: suggestedChange.to }
    );

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    await GoalHistory.create({
      goalId,
      userId: session.user.id,
      type: "adaptation",
      field: suggestedChange.field,
      from: previousValue,
      to: suggestedChange.to,
      date: new Date(),
    });

    return Response.json({ ok: true, version: result.newVersion });
  }

  return Response.json({ ok: false });
}
