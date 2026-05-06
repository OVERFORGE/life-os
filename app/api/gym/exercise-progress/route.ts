import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { getAuthSession } from "@/lib/auth";
import { scoreExerciseProgress } from "@/server/gym/progression/scoreExerciseProgress";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;

    const url = new URL(req.url);
    const equipmentName = url.searchParams.get("equipmentName");

    if (!equipmentName) {
      return NextResponse.json({ error: "equipmentName query parameter is required" }, { status: 400 });
    }

    // Fetch all sessions and extract the specific exercise history
    const sessions = await WorkoutSession.find({ userId }).sort({ date: 1 }).lean();

    const exerciseHistory: any[] = [];
    
    // To get the "targetReps Default", we can look if they have a routine with this exercise
    let targetRepsDefault = 10;
    const routine = await WorkoutRoutine.findOne({ userId, isActive: true }).lean();
    if (routine && routine.splitDays) {
      for (const day of routine.splitDays) {
        if (day.exercises) {
          const ex = day.exercises.find((e: any) => e.equipmentName === equipmentName);
          if (ex && ex.targetReps) {
            targetRepsDefault = ex.targetReps;
            break;
          }
        }
      }
    }

    for (const session of sessions) {
      if (session.exercises) {
        const targetExercise = session.exercises.find((ex: any) => ex.equipmentName === equipmentName);
        if (targetExercise && targetExercise.sets) {
          for (let i = 0; i < targetExercise.sets.length; i++) {
            const set = targetExercise.sets[i];
            exerciseHistory.push({
              date: session.date || session.createdAt,
              sessionId: session._id,
              setIndex: i + 1,
              weight: set.weightUsed || 0,
              reps: set.repsDone || 0,
              targetReps: targetRepsDefault
            });
          }
        }
      }
    }

    const progress = scoreExerciseProgress(exerciseHistory, targetRepsDefault);

    return NextResponse.json(progress);
  } catch (error: any) {
    console.error("Error in GET /api/gym/exercise-progress:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
