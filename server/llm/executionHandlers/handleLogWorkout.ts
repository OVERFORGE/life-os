import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { DailyLog } from "@/server/db/models/DailyLog";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

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

export async function handleLogWorkout(payload: { description: string }, userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const today = getActiveDate(user?.settings?.timezone);

    const desc = payload.description || "gym session";
    const durationSeconds = parseDurationSeconds(desc);
    const durationMinutes = Math.round(durationSeconds / 60);

    // Build a lightweight session record — no exercises needed for voice-logged sessions
    await WorkoutSession.create({
        userId,
        durationSeconds,
        splitDayName: "Voice Logged",
        exercises: [],
        date: new Date(`${today}T12:00:00Z`),
    });

    // Cross-sync: mark gym = true in DailyLog
    await DailyLog.findOneAndUpdate(
        { userId, date: today },
        {
            $set: { "physical.gym": true },
            $setOnInsert: { signals: {}, sleep: {}, mental: {}, work: {} }
        },
        { upsert: true }
    );

    return {
        type: "log_workout",
        success: true,
        data: {
            date: today,
            durationMinutes,
            message: `Workout session logged (${durationMinutes} min). Gym marked for today.`
        }
    };
}
