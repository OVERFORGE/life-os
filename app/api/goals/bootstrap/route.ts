import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GOAL_TEMPLATES } from "@/features/goals/templates";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Avoid duplicates
  const existing = await Goal.find({ userId: session.user.id });
  if (existing.length > 0) {
    return Response.json({ ok: true, message: "Goals already exist" });
  }

  const docs = GOAL_TEMPLATES.map((t) => ({
    ...t,
    userId: session.user.id,
    cadence: "daily",
    rules: {
      minActiveDaysPerWeek: 3,
      graceDaysPerWeek: 2,
    },
  }));

  await Goal.insertMany(docs);

  return Response.json({ ok: true });
}
