import { Goal } from "@/features/goals/models/Goal";
import { goalEngine } from "@/features/goals/engine/goalEngine";

export async function handleDeleteGoal(
    payload: any,
    userId: string,
    goalModelOrOptions: any = Goal,
    outboxServiceParam?: any
) {
    let toDelete: any = null;
    const goalModel = goalModelOrOptions?.goalModel || (goalModelOrOptions?.findOne ? goalModelOrOptions : Goal);
    const outboxService = outboxServiceParam || goalModelOrOptions?.outboxService;

    // 1. Try match by ID if provided
    const idToFind = payload.goalId || payload._id || payload.id;
    if (idToFind) {
        toDelete = await goalModel.findOne({ _id: idToFind, userId });
    }

    // 2. Try exact match by title if title is provided
    if (!toDelete && payload.title) {
        toDelete = await goalModel.findOne({ userId, title: payload.title });

        // 3. Try case-insensitive exact match
        if (!toDelete) {
            const escapedTitle = payload.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            toDelete = await goalModel.findOne({ userId, title: new RegExp(`^${escapedTitle}$`, 'i') });
        }

        // 4. Try partial string match
        if (!toDelete) {
            const activeGoals = await goalModel.find({ userId, status: { $ne: "archived" } }).select("title").lean();
            const bestMatch = activeGoals.find((g: any) => 
                g.title.toLowerCase().includes(payload.title.toLowerCase()) || 
                payload.title.toLowerCase().includes(g.title.toLowerCase())
            );
            if (bestMatch) {
                toDelete = await goalModel.findById((bestMatch as any)._id);
            }
        }
    }

    if (!toDelete) {
        return { type: "delete_goal", success: false, error: "Goal not found strictly matching that title or ID in DB" };
    }

    // Soft Archival exclusively (no physical deleteOne)
    const result = await goalEngine.deleteGoal(
        userId,
        String(toDelete._id),
        typeof toDelete.version === "number" ? toDelete.version : undefined,
        {
            reason: payload.reason || "Deleted via execution handler",
            goalModel,
            outboxService,
        }
    );

    if (!result.success) {
        return { type: "delete_goal", success: false, error: result.error };
    }

    return {
        type: "delete_goal",
        success: true,
        data: {
            deletedTitle: toDelete.title,
            goalId: String(toDelete._id),
            archivedAt: result.goal?.archivedAt,
        },
    };
}
