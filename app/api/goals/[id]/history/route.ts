import { connectDB } from "@/server/db/connect";
import { GoalHistory } from "@/server/db/models/GoalHistory";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const history = await GoalHistory.find({
    goalId: params.id,
    userId: session.user.id,
  })
    .sort({ date: 1 })
    .lean();

  return NextResponse.json(history);
}
