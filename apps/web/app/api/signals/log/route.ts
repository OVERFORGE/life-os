import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getAuthSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { OutboxStorageService, OutboxEventDraft } from "@life-os/execution-kernel";

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
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const body: any = await req.json();
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
  /* Save Document with Standalone Outbox Fencing          */
  /* ===================================================== */

  let dailyLog = await DailyLog.findOne({ userId, date });
  if (!dailyLog) {
    dailyLog = await DailyLog.create({
      userId,
      date,
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });
  }

  const currentVersion = typeof dailyLog.version === "number" ? dailyLog.version : 0;
  const currentEpoch = typeof dailyLog.mutationEpoch === "number" ? dailyLog.mutationEpoch : 0;
  const clientMutationId = `mut_signal_${dailyLog._id}_${key}_${Date.now()}`;
  const diffHash = `diff_signal_${dailyLog._id}_${key}_${currentVersion + 1}`;

  // Ensure legacy record has version fields if missing
  if (dailyLog.version === undefined || dailyLog.mutationEpoch === undefined) {
    await DailyLog.updateOne(
      { _id: dailyLog._id, version: { $exists: false } },
      { $set: { version: 0, mutationEpoch: 0, recentMutationReceipts: [] } }
    );
  }

  const outboxService = OutboxStorageService.getInstance();
  const eventDraft: OutboxEventDraft = {
    userId: String(userId),
    category: "DOMAIN_EVENT",
    type: "domain.signal.logged",
    aggregateId: String(dailyLog._id),
    aggregateType: "dailylog",
    aggregateVersion: currentVersion + 1,
    source: "web.signals.log",
    payload: {
      userId: String(userId),
      date,
      key,
      value,
    },
    occurredAt: new Date(),
  };

  await outboxService.persistWithStandaloneFencing({
    userId: String(userId),
    aggregateModel: DailyLog,
    aggregateId: String(dailyLog._id),
    clientMutationId,
    diffHash,
    expectedVersion: currentVersion,
    fencingEpoch: currentEpoch,
    domainUpdates: setPayload,
    eventDrafts: [eventDraft],
  });

  return NextResponse.json({
    ok: true,
    saved: { key, value },
    syncedLegacy: CORE_SIGNAL_MAP[key]?.path || null,
  });
}
