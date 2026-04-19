import { DailyLog } from "@/server/db/models/DailyLog";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { computeSleepDelta } from "./timeUtils";

/**
 * syncEngine.ts
 * Integrates external DB schemas (Nutrition, Gym) down into the DailyLog unified signals structure.
 * Deterministic and only fills gaps (does not overwrite manual user inputs).
 */
export async function syncEngine(userId: string, activeDateStr: string) {
    const actionsTaken: string[] = [];
    
    // 1. Get Today's Log
    const todayLog = await DailyLog.findOne({ userId, date: activeDateStr });
    if (!todayLog) return actionsTaken; // Run dailyLoop first to ensure log exists

    // 2. GYM SYNC
    // Did they do a workout today?
    if (todayLog.physical?.gym === undefined || todayLog.physical?.gym === null) {
        // Only override if undefined
        const todayStart = new Date(`${activeDateStr}T00:00:00.000Z`);
        const todayEnd = new Date(`${activeDateStr}T23:59:59.999Z`);
        const workout = await WorkoutSession.findOne({
            userId,
            date: { $gte: todayStart, $lte: todayEnd }
        });

        if (workout) {
            todayLog.physical = todayLog.physical || {};
            todayLog.physical.gym = true;
            actionsTaken.push("synced_gym");
        }
    }

    // 3. NUTRITION SYNC
    // Load daily calories
    const nutrition = await NutritionLog.findOne({ userId, date: activeDateStr });
    if (nutrition && nutrition.dailyTotals?.calories) {
        const cals = Math.round(nutrition.dailyTotals.calories);
        
        // Sync into dedicated physical schema
        if (todayLog.physical?.calories === undefined || todayLog.physical?.calories === null) {
            todayLog.physical = todayLog.physical || {};
            todayLog.physical.calories = cals;
            actionsTaken.push("synced_physical_calories");
        }
        
        // Also replicate to generic signal map for flex display
        if (!todayLog.signals) todayLog.signals = new Map();
        if (!todayLog.signals.has("calories")) {
            todayLog.signals.set("calories", cals);
            actionsTaken.push("synced_signals_calories");
        }
    }

    // 4. SLEEP CALCULATION
    if (todayLog.sleep?.wakeTime && !todayLog.sleep?.hours) {
        // Reconstruct yesterday
        const offsetDate = new Date(`${activeDateStr}T12:00:00Z`);
        offsetDate.setUTCDate(offsetDate.getUTCDate() - 1);
        const yesterdayStr = offsetDate.toISOString().split("T")[0];

        const yesterdayLog = await DailyLog.findOne({ userId, date: yesterdayStr });
        const sleepTime = yesterdayLog?.sleep?.sleepTime || todayLog.sleep?.sleepTime; // fallback if they slept past midnight today

        if (sleepTime) {
            const delta = computeSleepDelta(sleepTime, todayLog.sleep.wakeTime);
            if (delta !== null) {
                todayLog.sleep.hours = parseFloat(delta.toFixed(1));
                actionsTaken.push("computed_sleep_hours");
            }
        }
    }

    // 5. AUTO MENTAL COMPUTATION (Only if Day closed)
    // We consider it complete if they woke up and they went to sleep
    const isComplete = !!(todayLog.sleep?.wakeTime && todayLog.sleep?.sleepTime);
    
    if (isComplete) {
        todayLog.mental = todayLog.mental || {};
        
        let didMutateMental = false;

        // Auto Energy: Baseline 5. +1 for every hour of sleep over 6. Cap at 9. 
        if (todayLog.mental.energy === undefined && todayLog.sleep?.hours) {
            const sleepBonus = Math.max(0, todayLog.sleep.hours - 6);
            todayLog.mental.energy = Math.min(10, Math.round(5 + sleepBonus));
            didMutateMental = true;
        }

        // Auto Mood: Baseline 5. +1 if Gym. +1 if Deep Work > 2.
        if (todayLog.mental.mood === undefined) {
            let mood = 5;
            if (todayLog.physical?.gym) mood += 2;
            if (todayLog.work?.deepWorkHours && todayLog.work.deepWorkHours >= 2) mood += 1;
            todayLog.mental.mood = Math.min(10, mood);
            didMutateMental = true;
        }

        // Focus & Stress Defaults
        if (todayLog.mental.stress === undefined) {
            todayLog.mental.stress = 5;
            didMutateMental = true;
        }
        if (todayLog.mental.focus === undefined) {
            todayLog.mental.focus = todayLog.work?.deepWorkHours ? Math.min(10, 4 + todayLog.work.deepWorkHours) : 5;
            didMutateMental = true;
        }

        if (didMutateMental) actionsTaken.push("computed_mental_scores");
    }

    if (actionsTaken.length > 0) {
        todayLog.markModified('signals');
        await todayLog.save();
    }

    return actionsTaken;
}
