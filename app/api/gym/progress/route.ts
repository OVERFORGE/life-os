import { NextResponse } from "next/server";
import { connectDB } from "@/server/db/connect";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { WorkoutRoutine } from "@/server/db/models/WorkoutRoutine";
import { getAuthSession } from "@/lib/auth";
import { scoreOverallFitness } from "@/server/gym/progression/scoreOverallFitness";
import { scoreExerciseProgress } from "@/server/gym/progression/scoreExerciseProgress";
import { scoreSetProgress } from "@/server/gym/progression/scoreSetProgress";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = (session.user as any).id;

    // Get active routine
    const activeRoutine = await WorkoutRoutine.findOne({ userId, isActive: true }).lean();
    const targetDays = activeRoutine && activeRoutine.splitDays ? activeRoutine.splitDays.length : 4;

    // Get all sessions
    const sessions = await WorkoutSession.find({ userId }).sort({ date: 1 }).lean();

    const progress = scoreOverallFitness(sessions, targetDays);

    // If there is an active routine, we augment it with scores
    let augmentedRoutine = null;
    if (activeRoutine && activeRoutine.splitDays) {
      augmentedRoutine = JSON.parse(JSON.stringify(activeRoutine));
      
      for (const day of augmentedRoutine.splitDays) {
        let dayScoreSum = 0;
        let dayExerciseCount = 0;

        for (const ex of day.exercises) {
          const equipmentName = ex.equipmentName;
          const targetRepsDefault = ex.targetReps || 10;
          const targetSets = ex.targetSets || 3;
          
          // Build exercise history
          const exerciseHistory: any[] = [];
          for (const s of sessions) {
            if (s.exercises) {
              const targetExercise = s.exercises.find((e: any) => e.equipmentName === equipmentName);
              if (targetExercise && targetExercise.sets) {
                for (let i = 0; i < targetExercise.sets.length; i++) {
                  exerciseHistory.push({
                    date: s.date || s.createdAt,
                    sessionId: s._id,
                    setIndex: i + 1,
                    weight: targetExercise.sets[i].weightUsed || 0,
                    reps: targetExercise.sets[i].repsDone || 0,
                    targetReps: targetRepsDefault
                  });
                }
              }
            }
          }

          // Exercise Score
          const exProgress = scoreExerciseProgress(exerciseHistory, targetRepsDefault);
          ex.score = exProgress.score;
          dayScoreSum += exProgress.score;
          dayExerciseCount++;

          // Set Scores
          ex.setScores = [];
          for (let setIdx = 1; setIdx <= targetSets; setIdx++) {
            const specificSetHistory = exerciseHistory.filter(h => h.setIndex === setIdx);
            const setProgress = scoreSetProgress(specificSetHistory, targetRepsDefault);
            ex.setScores.push({
              setIndex: setIdx,
              score: setProgress.score,
              historyLength: setProgress.history.length
            });
          }
        }

        day.score = dayExerciseCount > 0 ? Math.round(dayScoreSum / dayExerciseCount) : 0;
      }
    }

    return NextResponse.json({
      ...progress,
      activeRoutine: augmentedRoutine
    });
  } catch (error: any) {
    console.error("Error in GET /api/gym/progress:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
