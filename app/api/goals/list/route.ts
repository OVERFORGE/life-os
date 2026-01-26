import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { evaluateAllGoals } from "@/features/goals/engine/evaluateAllGoals";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json([], { status: 401 });

  await connectDB();

  await evaluateAllGoals(session.user.id);

  const goals = await Goal.find({ userId: session.user.id }).lean();
  const stats = await GoalStats.find({}).lean();

  const statMap = new Map(stats.map((s) => [String(s.goalId), s]));

  const result = goals.map((g) => ({
    ...g,
    stats: statMap.get(String(g._id)),
  }));

  return Response.json(result);
}
