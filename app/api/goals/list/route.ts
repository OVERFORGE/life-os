import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { evaluateAllGoals } from "@/features/goals/engine/evaluateAllGoals";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json([], { status: 401 });
  }

  await connectDB();

  const goals = await evaluateAllGoals(session.user.id);

  return NextResponse.json(goals);
}
