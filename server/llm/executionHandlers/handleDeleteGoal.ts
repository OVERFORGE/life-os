import { Goal } from "@/features/goals/models/Goal";

export async function handleDeleteGoal(payload: any, userId: string) {
    const toDelete = await Goal.findOne({ userId, title: payload.title });
    if (toDelete) {
        await Goal.deleteOne({ _id: toDelete._id });
        return { type: "delete_goal", success: true, data: { deletedTitle: toDelete.title } };
    } else {
        return { type: "delete_goal", success: false, error: "Goal not found strictly matching that title in DB" };
    }
}
