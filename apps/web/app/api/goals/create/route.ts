import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { goalEngine } from "@/features/goals/engine/goalEngine";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";

export async function POST(req: Request) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  await connectDB();

  const result = await goalEngine.createGoal(session.user.id, body);

  if (!result.success || !result.goal) {
    return Response.json({ error: "Failed to create goal" }, { status: 500 });
  }

  try {
    await evaluateGoal({
      goal: result.goal,
      userId: session.user.id,
    });
  } catch (evalErr) {
    console.error("evaluateGoal background error:", evalErr);
  }

  return Response.json(
    {
      ok: true,
      id: result.goal._id,
      goal: result.goal,
      version: result.newVersion,
    },
    { status: 201 }
  );
}
