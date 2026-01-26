import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  await connectDB();

  const goal = await Goal.create({
    userId: session.user.id,
    title: body.title,
    type: body.type,
    signals: body.signals,
    rules: [],
  });

  // Evaluate immediately
  await evaluateGoal(goal, session.user.id);

  return Response.json({ ok: true, id: goal._id });
}
