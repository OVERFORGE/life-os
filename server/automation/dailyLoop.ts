import { DailyLog } from "@/server/db/models/DailyLog";
import { queueNotification } from "./notificationEngine";

/**
 * dailyLoop.ts
 * Bootstraps daily instances and manages single-day lifecycle reminders.
 */
export async function dailyLoop(userId: string, activeDateStr: string, isPast9PM: boolean) {
    const actionsTaken: string[] = [];

    // 1. INSTANTIATE DAILY LOG
    // If no log exists for the active timezone date, instantiate a clean one.
    let todayLog = await DailyLog.findOne({ userId, date: activeDateStr });
    
    if (!todayLog) {
        todayLog = await DailyLog.create({
            userId,
            date: activeDateStr,
            signals: new Map(), // ensure map is initialized
        });
        actionsTaken.push("created_active_log");
    }

    // 2. SLEEP REMINDER
    // If user is missing a sleepTime AND it is currently >= 21:00 (9PM)
    if (!todayLog.sleep?.sleepTime && isPast9PM) {
        const sent = await queueNotification(
            userId,
            "reminder",
            "Close Your Day",
            "Your day is still open. Don't forget to log your sleep."
        );
        if (sent) actionsTaken.push("queued_sleep_reminder");
    }

    return actionsTaken;
}
