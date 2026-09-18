import { Task } from "../../../../apps/web/server/db/models/Task";

export interface TaskData {
  _id?: string;
  userId: string;
  title: string;
  description?: string;
  dueDate: string;
  dueTime?: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed" | "skipped";
  completedAt?: Date;
  goalId?: string;
  parentTaskId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TaskRepository {
  private static instance: TaskRepository;

  static getInstance(): TaskRepository {
    if (!TaskRepository.instance) {
      TaskRepository.instance = new TaskRepository();
    }
    return TaskRepository.instance;
  }

  async findAllActiveTasks(userId: string): Promise<TaskData[]> {
    try {
      const docs = await Task.find({
        userId,
        status: { $in: ["pending", "completed"] },
      })
        .sort({ dueDate: 1 })
        .lean();

      return docs as unknown as TaskData[];
    } catch (error) {
      console.warn("[TaskRepository] Query failed, returning fallback empty array.", error);
      return [];
    }
  }

  async findTasksByGoalId(userId: string, goalId: string): Promise<TaskData[]> {
    try {
      const docs = await Task.find({ userId, goalId }).lean();
      return docs as unknown as TaskData[];
    } catch (error) {
      return [];
    }
  }
}
