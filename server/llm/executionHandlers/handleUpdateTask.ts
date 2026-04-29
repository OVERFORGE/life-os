// server/llm/executionHandlers/handleUpdateTask.ts
import { findTaskByTitle, updateTask } from "@/features/tasks/engine/taskEngine";

export async function handleUpdateTask(payload: any, userId: string) {
  let taskId = payload.taskId;

  if (!taskId && payload.title) {
    const found = await findTaskByTitle(userId, payload.title);
    if (found) taskId = String(found._id);
  }

  if (!taskId) {
    return { type: "update_task", success: false, error: "Could not find matching task to update" };
  }

  const { taskId: _id, title: _t, ...updates } = payload;
  const result = await updateTask(userId, taskId, updates);

  return {
    type: "update_task",
    success: result.success,
    taskTitle: (result as any).task?.title,
    error: (result as any).error,
  };
}
