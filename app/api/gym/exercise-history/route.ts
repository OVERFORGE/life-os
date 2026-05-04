import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { equipmentNames } = await req.json();
    if (!equipmentNames || !Array.isArray(equipmentNames)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await connectDB();

    const history: Record<string, any> = {};

    await Promise.all(
      equipmentNames.map(async (eq) => {
        // Find the most recent session that contains this specific exercise
        const lastSession = await WorkoutSession.findOne(
          { userId, "exercises.equipmentName": eq },
          { date: 1, exercises: 1 }
        )
          .sort({ date: -1 })
          .lean();

        if (lastSession && lastSession.exercises) {
          const matchedEx = lastSession.exercises.find((e: any) => e.equipmentName === eq);
          if (matchedEx && matchedEx.sets) {
            history[eq] = {
              date: lastSession.date,
              sets: matchedEx.sets,
            };
          }
        }
      })
    );

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error("Exercise history error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
