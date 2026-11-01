import mongoose from "mongoose";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "../../automation/timeUtils";
import { gymEngine, GymEngineOptions } from "@/features/gym/engine/gymEngine";

// Parse duration from free text like "1 hour", "45 minutes", "90 min"
function parseDurationSeconds(description: string): number {
    const text = description.toLowerCase();
    let totalSeconds = 0;

    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h(our)?/);
    const minMatch = text.match(/(\d+)\s*m(in)?/);

    if (hourMatch) totalSeconds += parseFloat(hourMatch[1]) * 3600;
    if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;

    // Default gym session: 60 minutes if nothing is extractable
    return totalSeconds > 0 ? totalSeconds : 3600;
}

export async function handleLogWorkout(
    payload: { description: string },
    userId: string,
    options?: GymEngineOptions
) {
    let timezone: string | undefined;
    try {
        if (mongoose.Types.ObjectId.isValid(userId)) {
            const user = await User.findById(userId).select("settings").lean();
            timezone = (user as any)?.settings?.timezone;
        }
    } catch {
        // Fallback for mock environments
    }
    const today = getActiveDate(timezone);

    const desc = payload.description || "gym session";
    const durationSeconds = parseDurationSeconds(desc);
    const durationMinutes = Math.round(durationSeconds / 60);

    // Canonical workout session creation via gymEngine
    const result = await gymEngine.logSession(
        userId,
        {
            durationSeconds,
            splitDayName: "Voice Logged",
            workoutType: "gym",
            date: new Date(`${today}T12:00:00Z`),
            dateOnly: today,
            timezone,
        },
        options
    );

    if (!result.success) {
        return {
            type: "log_workout",
            success: false,
            error: "Failed to log workout session through canonical gym engine",
        };
    }

    return {
        type: "log_workout",
        success: true,
        data: {
            sessionId: result.session?._id,
            date: today,
            durationMinutes,
            message: `Workout session logged (${durationMinutes} min). Recalculation dispatched for ${today}.`
        }
    };
}
