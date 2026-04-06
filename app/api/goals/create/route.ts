import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

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