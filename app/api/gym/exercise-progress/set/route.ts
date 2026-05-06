import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { getAuthSession } from "@/lib/auth";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";
import { detectProgression } from "@/server/gym/progression/detectProgression";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;

    const url = new URL(req.url);
    const equipmentName = url.searchParams.get("equipmentName");
    const setIndex = parseInt(url.searchParams.get("setIndex") || "1", 10);

    if (!equipmentName) {
      return NextResponse.json({ error: "equipmentName query parameter is required" }, { status: 400 });
    }

    // Get Target Reps Default
    let targetRepsDefault = 10;
    let routine = await WorkoutRoutine.findOne({ userId, isActive: true }).lean();
    if (!routine) {
      routine = await WorkoutRoutine.findOne({ userId }).sort({ createdAt: -1 }).lean();
    }
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

    // Fetch all sessions and extract the specific set history
    const sessions = await WorkoutSession.find({ userId }).sort({ date: 1 }).lean();

    const setHistory: any[] = [];

    for (const s of sessions) {
      if (s.exercises) {
        const targetExercise = s.exercises.find((ex: any) => ex.equipmentName === equipmentName);
        if (targetExercise && targetExercise.sets) {
          // setIndex is 1-based, array is 0-based
          const setLog = targetExercise.sets[setIndex - 1];
          if (setLog && setLog.weightUsed > 0 && setLog.repsDone > 0) {
            setHistory.push({
              date: s.date || s.createdAt,
              sessionId: s._id,
              weight: setLog.weightUsed,
              reps: setLog.repsDone,
              targetReps: targetRepsDefault
            });
          }
        }
      }
    }

    // Score it manually to get Estimated 1RM for the graph
    const gradedHistory: any[] = [];
    for (let i = 0; i < setHistory.length; i++) {
      const current = setHistory[i];
      const previous = i > 0 ? setHistory[i - 1] : null;
      
      const progression = detectProgression(
        current.weight,
        current.reps,
        previous?.weight || 0,
        previous?.reps || 0,
        current.targetReps
      );

      gradedHistory.push({
        ...current,
        progression
      });
    }

    // We return the raw graded history array so the frontend can plot it.
    return NextResponse.json(gradedHistory);
  } catch (error: any) {
    console.error("Error in GET /api/gym/exercise-progress/set:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
