import { User } from "@/server/db/models/User";
import { getActiveDate } from "../../automation/timeUtils";
import { upsertWeightLogWithOutbox } from "@/features/health/services/weightLogEngine";
import { updateUserProfileWithOutbox } from "@/features/user/services/userProfileEngine";

export async function handleUpdateWeight(payload: { weight: number; date?: string }, userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const today = payload.date || getActiveDate(user?.settings?.timezone);

    const weight = Number(payload.weight);
    if (!weight || isNaN(weight) || weight <= 0) {
        return { type: "update_weight", success: false, error: "Invalid weight value." };
    }

    const weightResult = await upsertWeightLogWithOutbox(userId, today, weight, {
        source: "kernel.update_weight",
    });
    if (!weightResult.success) {
        return {
            type: "update_weight",
            success: false,
            error: weightResult.error || "Failed to persist weight log through outbox.",
        };
    }

    // Keep User.weight snapshot updated through canonical outboxed profile engine
    await updateUserProfileWithOutbox(
        userId,
        { weight },
        { source: "kernel.update_weight.snapshot" }
    );

    return {
        type: "update_weight",
        success: true,
        data: {
            weight,
            date: today,
            version: weightResult.newVersion,
            message: `Weight logged as ${weight}kg for ${today}.`,
        },
    };
}
