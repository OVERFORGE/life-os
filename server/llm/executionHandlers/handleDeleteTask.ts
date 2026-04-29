// server/llm/executionHandlers/handleDeleteTask.ts
import { findTaskByTitle, deleteTask } from "@/features/tasks/engine/taskEngine";
import { Task } from "@/server/db/models/Task";

export async function handleDeleteTask(payload: any, userId: string) {
  let taskId = payload.taskId;

  if (!taskId && payload.title) {
    const found = await findTaskByTitle(userId, payload.title);
    if (found) taskId = String(found._id);
  }

  if (!taskId) {
    return { type: "delete_task", success: false, error: "Could not find matching task to delete" };
  }

  const task = await Task.findOne({ _id: taskId, userId }).lean();
  const result = await deleteTask(userId, taskId);

  return {
    type: "delete_task",
    success: result.success,
    taskTitle: (task as any)?.title,
    error: (result as any).error,
  };
}
