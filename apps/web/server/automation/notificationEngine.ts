import { NotificationLog } from "@/server/db/models/Notification";

export type NotificationType = "system" | "reminder" | "alert";

/**
 * notificationEngine.ts
 * Safely dispatches deterministic notifications.
 */
export async function queueNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string
) {
    try {
        // Prevent duplicate spam. E.g. we only want 1 reminder of a certain body/title per day.
        // We'll check if a notification with the SAME Title was generated for this user TODAY.
        
        // Define 'today' boundary purely in UTC since notifications happen via server clock normally
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const existing = await NotificationLog.findOne({
            userId,
            title,
            createdAt: { $gte: todayStart }
        });

        if (existing) {
            return false; // Suppress duplicate
        }

        // Fire
        const notif = await NotificationLog.create({
            userId,
            type,
            title,
            body,
            read: false
        });

        console.log(`🔔 [NOTIF ENGINE] Queued: "${title}" for User ${userId}`);
        return true;
    } catch (e) {
        console.error("❌ Notification Engine Error:", e);
        return false;
    }
}
