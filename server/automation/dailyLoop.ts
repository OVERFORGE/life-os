import { DailyLog } from "@/server/db/models/DailyLog";
import { NotificationLog } from "@/server/db/models/Notification";
import { queueNotification } from "./notificationEngine";
import { isPastHour } from "./timeUtils";

/**
 * dailyLoop.ts
 * Bootstraps daily instances and manages single-day lifecycle reminders.
 */
export async function dailyLoop(
    userId: string,
    activeDateStr: string,
    isPast9PM: boolean,
    preferences: Record<string, any> = {},
    timezone?: string
) {
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

    // 3. WEIGHT REMINDER
    // Fire if: reminder enabled + today's day-of-week matches user's chosen day + current hour >= chosen hour
    const reminderEnabled: boolean = preferences.weightReminderEnabled !== false;
    const reminderDay: number    = preferences.weightReminderDay ?? 0;  // 0=Sun
    const reminderHour: number   = preferences.weightReminderHour ?? 9; // 9am

    if (reminderEnabled) {
        // Get current day-of-week in user's local timezone
        const now = new Date();
        const localDayFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            weekday: 'short'
        });
        const dayParts = localDayFormatter.formatToParts(now);
        const weekdayStr = dayParts.find(p => p.type === 'weekday')?.value || '';
        const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const currentDayOfWeek = weekdayMap[weekdayStr] ?? -1;

        const isReminderDay = currentDayOfWeek === reminderDay;
        const isPastReminderHour = isPastHour(timezone, reminderHour);

        if (isReminderDay && isPastReminderHour) {
            // Only send once per day — check if we already sent one today
            const alreadySent = await NotificationLog.findOne({
                userId,
                title: "⚖️ Time to Weigh Yourself",
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }).lean();

            if (!alreadySent) {
                const sent = await queueNotification(
                    userId,
                    "reminder",
                    "⚖️ Time to Weigh Yourself",
                    "It's your weekly weigh-in! Step on the scale and tell the Health AI your weight."
                );
                if (sent) actionsTaken.push("queued_weight_reminder");
            }
        }
    }

    return actionsTaken;
}
