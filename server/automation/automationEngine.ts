import { getActiveDate, isPastHour } from "./timeUtils";
import { dailyLoop } from "./dailyLoop";
import { syncEngine } from "./syncEngine";
import { missedDayRecovery } from "./missedDayRecovery";
import { NotificationLog } from "@/server/db/models/Notification";
import { User } from "@/server/db/models/User";

/**
 * automationEngine.ts
 * The Deterministic Brain of LifeOS. 
 * Orchestrates background loop operations (Sync, Loop, Recovery).
 */
export async function runAutomation(userId: string) {
    const startTime = Date.now();
    let actions: string[] = [];

    try {
        // 1. Context Gather
        const user = await User.findById(userId).select("settings").lean();
        const timezone = user?.settings?.timezone; // Might be undefined, which falls back to server time safely
        
        const activeDateStr = getActiveDate(timezone);
        const past9PM = isPastHour(timezone, 21.0);

        // 2. Execute Modules Sequentially
        const loopActions = await dailyLoop(userId, activeDateStr, past9PM);
        actions.push(...loopActions);

        const syncActions = await syncEngine(userId, activeDateStr);
        actions.push(...syncActions);

        const recoveryActions = await missedDayRecovery(userId, activeDateStr);
        actions.push(...recoveryActions);

        // 3. Collect active unread notifications generated recently
        const recentNotifs = await NotificationLog.find({ 
            userId, 
            read: false,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
        }).select("type title body createdAt").lean();

        const duration = Date.now() - startTime;
        console.log(`🤖 [AUTOMATION] Processed for user ${userId} in ${duration}ms. Actions: ${actions.length}`);

        return {
            success: true,
            durationMs: duration,
            actions,
            notifications: recentNotifs
        };
    } catch (e: any) {
        console.error("❌ [AUTOMATION FATAL ERROR]:", e);
        return {
            success: false,
            error: e.message,
            actions,
            notifications: []
        };
    }
}
