import { WeightLog } from "@/server/db/models/WeightLog";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

export async function handleUpdateWeight(payload: { weight: number }, userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const today = getActiveDate(user?.settings?.timezone);

    const weight = Number(payload.weight);
    if (!weight || isNaN(weight)) {
        return { type: "update_weight", success: false, error: "Invalid weight value." };
    }

    // Upsert: one entry per day max (the compound index enforces this)
    await WeightLog.findOneAndUpdate(
        { userId, date: today },
        { weight },
        { upsert: true, new: true }
    );

    // Keep User.weight as the most recent value (not history, just latest snapshot)
    await User.findByIdAndUpdate(userId, { weight });

    return {
        type: "update_weight",
        success: true,
        data: { weight, date: today, message: `Weight logged as ${weight}kg for ${today}.` }
    };
}
