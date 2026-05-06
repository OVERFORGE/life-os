import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";
import { verifyAuth } from "@/server/auth/verifyAuth";
import { scoreOverallFitness } from "@/server/gym/progression/scoreOverallFitness";

export async function GET(req: Request) {
  try {
    const user = await verifyAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();

    // Find active routine days if any, otherwise default to 4
    const activeRoutine = await WorkoutRoutine.findOne({ userId: user._id, isActive: true }).lean();
    const targetDays = activeRoutine && activeRoutine.splitDays ? activeRoutine.splitDays.length : 4;

    // Get all sessions
    const sessions = await WorkoutSession.find({ userId: user._id }).sort({ date: 1 }).lean();

    const progress = scoreOverallFitness(sessions, targetDays);

    return NextResponse.json(progress);
  } catch (error: any) {
    console.error("Error in GET /api/gym/progress:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
