import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";

import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await connectDB();

  const goal = await Goal.create({
    ...body,
    userId: session.user.id,
  });

  /* ================================================= */
  /* ✅ FIX: pass SINGLE OBJECT (correct contract)      */
  /* ================================================= */

  await evaluateGoal({
    goal,
    userId: session.user.id,
  });

  return Response.json({
    ok: true,
    id: goal._id,
  });
}