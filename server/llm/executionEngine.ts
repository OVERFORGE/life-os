import { ExtractedAction } from "./actionExtractor";
import { handleLogActivity } from "./executionHandlers/handleLogActivity";
import { handleCreateGoal } from "./executionHandlers/handleCreateGoal";
import { handleDeleteGoal } from "./executionHandlers/handleDeleteGoal";
import { handleProposeGoal } from "./executionHandlers/handleProposeGoal";
import { handleConfirmGoal } from "./executionHandlers/handleConfirmGoal";

/* ===================================================== */
/* 🚀 SYSTEM KERNEL (DETERMINISTIC ROUTING)              */
/* ===================================================== */

export async function executeActions(actions: ExtractedAction[], userId: string, model?: string) {
    const results: any[] = [];

    for (const action of actions) {
        try {
            const { type, payload } = action;

            switch (type) {
                case "log_activity":
                    const logResult = await handleLogActivity(payload, userId);
                    results.push(logResult);
                    break;
                case "propose_goal":
                    const proposeResult = await handleProposeGoal(payload.userMessage, userId, model);
                    results.push(proposeResult);
                    break;
                case "confirm_goal":
                    const confirmResult = await handleConfirmGoal(payload.userMessage, userId, model);
                    results.push(confirmResult);
                    break;
                case "delete_goal":
                    const deleteResult = await handleDeleteGoal(payload, userId);
                    results.push(deleteResult);
                    break;
                default:
                    console.warn("Unknown action type extracted:", type);
            }
        } catch (e: any) {
            results.push({ type: action.type, success: false, error: e.message });
        }
    }

    return results;
}
