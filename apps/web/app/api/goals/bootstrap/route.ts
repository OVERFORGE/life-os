import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GOAL_TEMPLATES } from "@/features/goals/templates";
import { createGoal } from "@/features/goals/engine/goalEngine";
import { getAuthSession } from "@/lib/auth";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Avoid duplicates
  const existing = await Goal.find({ userId: session.user.id });
  if (existing.length > 0) {
    return Response.json({ ok: true, message: "Goals already exist" });
  }

  const createdGoals = [];
  for (let i = 0; i < GOAL_TEMPLATES.length; i++) {
    const t = GOAL_TEMPLATES[i];
    const clientMutationId = `mut_bootstrap_goal_${session.user.id}_${i}`;
    const result = await createGoal(
      session.user.id,
      {
        ...t,
        type: t.type as any,
        cadence: "daily",
        rules: {
          minActiveDaysPerWeek: 3,
          graceDaysPerWeek: 2,
        },
      },
      { clientMutationId }
    );
    if (result.success) {
      createdGoals.push(result.goal);
    }
  }

  return Response.json({ ok: true, count: createdGoals.length });
}
