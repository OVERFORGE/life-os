import { Goal } from "@/features/goals/models/Goal";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

export async function handleDeleteGoal(payload: any, userId: string) {
    // 1. Try exact match
    let toDelete = await Goal.findOne({ userId, title: payload.title });

    // 2. Try case-insensitive exact match
    if (!toDelete) {
        // Escape regex special characters in the payload title just in case
        const escapedTitle = payload.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        toDelete = await Goal.findOne({ userId, title: new RegExp(`^${escapedTitle}$`, 'i') });
    }

    // 3. Try partial string match (e.g. LLM outputs "learning guitar daily" but title is "Learn Guitar")
    if (!toDelete) {
        const activeGoals = await Goal.find({ userId }).select("title").lean();
        const bestMatch = activeGoals.find(g => 
            g.title.toLowerCase().includes(payload.title.toLowerCase()) || 
            payload.title.toLowerCase().includes(g.title.toLowerCase())
        );
        if (bestMatch) {
            toDelete = await Goal.findById(bestMatch._id);
        }
    }

    if (toDelete) {
        const signalKeys = toDelete.signals.map((s: any) => s.key);
        await Goal.deleteOne({ _id: toDelete._id });

        // Cleanup orphaned signals
        if (signalKeys.length > 0) {
            const remainingGoals = await Goal.find({ userId, "signals.key": { $in: signalKeys } });
            const usedKeys = new Set(remainingGoals.flatMap(g => g.signals.map((s: any) => s.key)));
            
            const orphanedKeys = signalKeys.filter((k: string) => !usedKeys.has(k));
            if (orphanedKeys.length > 0) {
                await LifeSignal.deleteMany({ userId, key: { $in: orphanedKeys } });
            }
        }

        return { type: "delete_goal", success: true, data: { deletedTitle: toDelete.title } };
    } else {
        return { type: "delete_goal", success: false, error: "Goal not found strictly matching that title in DB" };
    }
}
