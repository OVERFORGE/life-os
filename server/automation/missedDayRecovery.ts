import { DailyLog } from "@/server/db/models/DailyLog";
import { queueNotification } from "./notificationEngine";

/**
 * missedDayRecovery.ts
 * Scans the last 3 days to see if the user abandoned their log.
 */
export async function missedDayRecovery(userId: string, activeDateStr: string) {
    const actionsTaken: string[] = [];
    
    // We want the 3 days preceding the active date.
    const activeDateObj = new Date(`${activeDateStr}T12:00:00Z`); // use noon to avoid boundary shifting
    
    for (let i = 1; i <= 3; i++) {
        const lookback = new Date(activeDateObj);
        lookback.setUTCDate(lookback.getUTCDate() - i);
        const lookbackStr = lookback.toISOString().split("T")[0];

        const log = await DailyLog.findOne({ userId, date: lookbackStr });
        const missing = !log || (!log.sleep?.wakeTime && !log.sleep?.sleepTime);

        if (missing) {
            const sent = await queueNotification(
                userId,
                "reminder",
                "Missed Log",
                `You missed logging for ${lookbackStr}. Want to fill it?`
            );
            if (sent) {
                actionsTaken.push(`queued_missed_day_${lookbackStr}`);
                // Break early so we don't spam them with 3 notifications at once.
                break;
            }
        }
    }

    return actionsTaken;
}
