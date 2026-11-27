import { DailySession } from "@/features/dailySession/models/DailySession";
import { computeDayInsights } from "@/features/insights/computeDayInsights";
import { NotificationLog } from "@/server/db/models/Notification";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "../../automation/timeUtils";
import { updateGoalStats } from "@/features/goals/engine/updateGoalStats";
import {
  ensureDailyLogShell,
  upsertDailyLogWithOutbox,
} from "@/features/daily-log/services/dailyLogEngine";
import { upsertCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

function parseTimeStr(timeStr: string) {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return 0;
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2] || "0");
  const modifier = match[3]?.toLowerCase();
  
  if (modifier === "pm" && hours < 12) hours += 12;
  if (modifier === "am" && hours === 12) hours = 0;
  
  return hours + mins / 60;
}

function calculateTimeDifference(sleepTime: string, wakeTime: string) {
  const s = parseTimeStr(sleepTime);
  const w = parseTimeStr(wakeTime);
  let diff = w - s;
  if (diff < 0) diff += 24; 
  return diff;
}

function calculateMentalScore({ sleepHours, gym, deepWorkHours }: any) {
  let energy = 5, focus = 5, mood = 5, stress = 5, anxiety = 5;
  if (sleepHours >= 7 && sleepHours <= 9) { energy += 2; focus += 2; mood += 1; stress -= 1; } 
  else if (sleepHours < 5 && sleepHours > 0) { energy -= 3; focus -= 2; mood -= 2; stress += 2; anxiety += 1; }
  if (gym) { energy += 1; mood += 2; stress -= 2; anxiety -= 1; }
  if (deepWorkHours >= 4) { focus += 2; mood += 1; stress += 1; }
  const cap = (val: number) => Math.max(1, Math.min(10, val));
  return { energy: cap(energy), focus: cap(focus), mood: cap(mood), stress: cap(stress), anxiety: cap(anxiety) };
}

function shouldAccumulate(key: string): boolean {
    const accumulateKeys = ["pages_read", "calories", "steps", "reps", "water_glasses"];
    return accumulateKeys.includes(key.toLowerCase());
}

export async function handleLogActivity(payload: any, userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const dateUsed = getActiveDate(user?.settings?.timezone);

    let session = await DailySession.findOne({ userId, isComplete: false }).sort({ createdAt: -1 });

    if (session && session.date !== dateUsed) {
        await upsertCatalogDocWithOutbox({
            userId,
            model: DailySession,
            filter: { _id: session._id, userId },
            aggregateType: "daily_session",
            eventType: "domain.daily_log.updated",
            domain: "daily-log",
            updateFields: { isComplete: true },
            options: { source: "kernel.log_activity.close_prev_session" },
        });
        session = null;
    }

    if (!session) {
        const createdSessionRes = await upsertCatalogDocWithOutbox({
            userId,
            model: DailySession,
            filter: { userId, date: dateUsed, isComplete: false },
            aggregateType: "daily_session",
            eventType: "domain.daily_log.updated",
            domain: "daily-log",
            updateFields: {},
            createFields: { userId, date: dateUsed, isComplete: false },
            createIfMissing: true,
            options: { source: "kernel.log_activity.init_session" },
        });
        session = createdSessionRes.doc;
    }

    const finalDate = session.date;

    const log = await ensureDailyLogShell(userId, finalDate);

    if (!log.sleep) log.sleep = {};
    if (!log.physical) log.physical = {};
    if (!log.work) log.work = {};
    if (!log.mental) log.mental = {};
    if (!(log.signals instanceof Map)) log.signals = new Map(Object.entries(log.signals || {}));

    if (payload.deepWorkHours !== undefined) {
        const prev = log.work?.deepWorkHours || 0;
        log.work.deepWorkHours = prev + Number(payload.deepWorkHours);
    }
    if (payload.wakeTime) {
        session.wakeTime = payload.wakeTime;
        log.sleep.wakeTime = payload.wakeTime;
    }
    
    // If they report both sleep and wake concurrently (like in the morning), map the sleep backwards
    if (payload.sleepTime) {
        if (payload.wakeTime) {
            // Append retroactively to yesterday
            const offsetDate = new Date(`${dateUsed}T12:00:00Z`);
            offsetDate.setUTCDate(offsetDate.getUTCDate() - 1);
            const yesterday = offsetDate.toISOString().split("T")[0];
            
            await upsertDailyLogWithOutbox({
                userId,
                date: yesterday,
                dotUpdates: { "sleep.sleepTime": payload.sleepTime },
                preserveSignals: true,
                options: { source: "kernel.log_activity.yesterday_sleep" },
            });
            await upsertCatalogDocWithOutbox({
                userId,
                model: DailySession,
                filter: { userId, date: yesterday },
                aggregateType: "daily_session",
                eventType: "domain.daily_log.updated",
                domain: "daily-log",
                updateFields: { sleepTime: payload.sleepTime, isComplete: true },
                createFields: { userId, date: yesterday },
                createIfMissing: true,
                options: { source: "kernel.log_activity.yesterday_sleep_session" },
            });
        } else {
            // Standard EOD logging
            session.sleepTime = payload.sleepTime;
            log.sleep.sleepTime = payload.sleepTime;
            session.isComplete = true;
        }

        // The auto sleep-hours computation will natively be picked up by the background syncEngine.
    }

    if (payload.gym) {
        log.physical.gym = true;
    }

    // Signals Logic (Clean)
    if (payload.signals) {
        const forbiddenKeys = ["mood", "energy", "stress", "sleephours", "anxiety", "focus"];
        for (const [key, value] of Object.entries(payload.signals)) {
            const cleanedKey = key.toLowerCase();
            if (forbiddenKeys.includes(cleanedKey)) continue;

            const numericValue = Number(value);
            if (shouldAccumulate(cleanedKey)) {
                const prev = Number(log.signals.get(key) || 0);
                log.signals.set(key, prev + numericValue);
            } else {
                log.signals.set(key, numericValue); // Overwrite explicitly for booleans or one-time metrics mapped to integers
            }
        }
    }

    if (payload.mentalOverrides) {
        for (const [key, value] of Object.entries(payload.mentalOverrides)) {
            (log.mental as any)[key] = Number(value);
        }
    } else if (session.isComplete) {
        const mentalOutput = calculateMentalScore({
            sleepHours: log.sleep?.hours || 0,
            gym: log.physical?.gym || false,
            deepWorkHours: log.work?.deepWorkHours || 0
        });
        log.mental = mentalOutput;

        await NotificationLog.create({
            userId, title: "Day Complete 🌙", body: "Auto-calculated mental scores. Feel free to override them if inaccurate.", type: "system"
        });
        
        log.meta = log.meta || {};
        const scoreStr = Object.entries(mentalOutput).map(([k, v]) => `${k}: ${v}`).join(", ");
        log.meta.ai_instruction = `Day just closed. Auto-calculated mental scores: [${scoreStr}]. Tell the user these are auto-calculated baseline scores, but they can explicitly override them if they feel differently.`;
    }

    const outboxResult = await upsertDailyLogWithOutbox({
        userId,
        date: finalDate,
        sections: {
            sleep: log.sleep,
            physical: log.physical,
            work: log.work,
            mental: log.mental,
            signals: log.signals,
        },
        preserveSignals: false,
        options: { source: "kernel.log_activity" },
    });
    if (!outboxResult.success) {
        throw new Error(outboxResult.error || "Failed to persist activity via outbox");
    }
    await upsertCatalogDocWithOutbox({
        userId,
        model: DailySession,
        filter: { _id: session._id, userId },
        aggregateType: "daily_session",
        eventType: "domain.daily_log.updated",
        domain: "daily-log",
        updateFields: {
            wakeTime: session.wakeTime,
            sleepTime: session.sleepTime,
            isComplete: session.isComplete,
        },
        options: { source: "kernel.log_activity.session_sync" },
    });
    
    if (session.isComplete) {
       await computeDayInsights({ userId, date: finalDate, session });
    }

    // Recalculate goal stats and scores instantly to reflect the new logs in the UI
    await updateGoalStats(userId);

    return { type: "log_activity", success: true, data: { logUpdates: payload, ai_instruction: log.meta?.ai_instruction } };
}
