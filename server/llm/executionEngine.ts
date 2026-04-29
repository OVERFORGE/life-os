import { ExtractedAction } from "./actionExtractor";
import { handleLogActivity } from "./executionHandlers/handleLogActivity";
import { handleCreateGoal } from "./executionHandlers/handleCreateGoal";
import { handleDeleteGoal } from "./executionHandlers/handleDeleteGoal";
import { handleProposeGoal } from "./executionHandlers/handleProposeGoal";
import { handleConfirmGoal } from "./executionHandlers/handleConfirmGoal";
import { handleUpdateWeight } from "./executionHandlers/handleUpdateWeight";
import { handleLogMeal } from "./executionHandlers/handleLogMeal";
import { handleLogWorkout } from "./executionHandlers/handleLogWorkout";
import { handleSetDietMode } from "./executionHandlers/handleSetDietMode";
import { handleCreateTask } from "./executionHandlers/handleCreateTask";
import { handleCompleteTask } from "./executionHandlers/handleCompleteTask";
import { handleDeleteTask } from "./executionHandlers/handleDeleteTask";
import { handleUpdateTask } from "./executionHandlers/handleUpdateTask";

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
                case "update_weight":
                    const weightResult = await handleUpdateWeight(payload, userId);
                    results.push(weightResult);
                    break;
                case "log_meal":
                    const mealResult = await handleLogMeal(payload, userId);
                    results.push(mealResult);
                    break;
                case "log_workout":
                    const workoutResult = await handleLogWorkout(payload, userId);
                    results.push(workoutResult);
                    break;
                case "propose_diet_mode":
                    // Proposal phase — LLM detected intent, returns a suggested plan for user approval
                    const dietProposal = await handleSetDietMode({ ...payload, confirmed: false }, userId);
                    results.push(dietProposal);
                    break;
                case "confirm_diet_mode":
                    // Confirmation phase — user approved, apply the changes
                    const dietConfirm = await handleSetDietMode({ ...payload, confirmed: true }, userId);
                    results.push(dietConfirm);
                    break;

                // ── TASK ACTIONS ────────────────────────────────────────────
                case "create_task":
                    results.push(await handleCreateTask(payload, userId));
                    break;
                case "complete_task":
                    results.push(await handleCompleteTask(payload, userId));
                    break;
                case "delete_task":
                    results.push(await handleDeleteTask(payload, userId));
                    break;
                case "update_task":
                    results.push(await handleUpdateTask(payload, userId));
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
