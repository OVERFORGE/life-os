import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { NextResponse } from "next/server";

/* ===================================================== */
/* Core Signal → Legacy Field Sync Map                   */
/* ===================================================== */

const CORE_SIGNAL_MAP: Record<string, { path: string }> = {
  mood: { path: "mental.mood" },
  energy: { path: "mental.energy" },
  stress: { path: "mental.stress" },

  sleepHours: { path: "sleep.hours" },
  sleepTime: { path: "sleep.sleepTime" },
  wakeTime: { path: "sleep.wakeTime" },

  deepWorkHours: { path: "work.deepWorkHours" },

  coded: { path: "work.coded" },
  executioners: { path: "work.executioners" },
  studied: { path: "work.studied" },
  mainWork: { path: "work.mainWork" },

  
  reading: { path: "habits.reading" },
  meditationHabit: { path: "habits.meditation" },
  codingHabit: { path: "habits.coding" },
  content: { path: "habits.content" },
  learning: { path: "habits.learning" },
  noFap: { path: "habits.noFap" },

  junkFoodHad: { path: "habits.junkFood.had" },
  junkFoodTimes: { path: "habits.junkFood.times" },
  junkFoodWhat: { path: "habits.junkFood.what" },

  socialMediaOveruse: { path: "habits.socialMediaOveruse" },

  gym: { path: "physical.gym" },
  steps: { path: "physical.steps" },
  calories: { path: "physical.calories" },
  meals: { path: "physical.meals" },
  dietNote: { path: "physical.dietNote" },
  painNote: { path: "physical.painNote" },
};

/* ===================================================== */
/* POST — Save Signal Value + Sync Legacy Fields         */
/* ===================================================== */

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const body = await req.json();
  const { date, key, value } = body;

  if (!date || !key) {
    return NextResponse.json(
      { error: "date and key are required" },
      { status: 400 }
    );
  }

  await connectDB();

  /* ===================================================== */
  /* Build Atomic Update Payload                           */
  /* ===================================================== */

  const setPayload: Record<string, any> = {
    [`signals.${key}`]: value,
  };

  /* ===================================================== */
  /* Sync Core Signal → Legacy DailyLog Fields             */
  /* ===================================================== */

  if (CORE_SIGNAL_MAP[key]) {
    const legacyPath = CORE_SIGNAL_MAP[key].path;

    if (typeof value === "number" && (value === 0 || value === 1)) {
    setPayload[legacyPath] = value === 1;
    } else {
        setPayload[legacyPath] = value;
    }
  }

  /* ===================================================== */
  /* Save Document (Atomic + Safe)                         */
  /* ===================================================== */

  await DailyLog.findOneAndUpdate(
    { userId, date },
    {
      $set: setPayload,

      $setOnInsert: {
        userId,
        date,
      },
    },
    { upsert: true }
  );

  return NextResponse.json({
    ok: true,
    saved: { key, value },
    syncedLegacy: CORE_SIGNAL_MAP[key]?.path || null,
  });
}
