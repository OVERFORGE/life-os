import { Task } from "../../../../apps/web/server/db/models/Task";
import { QueryTasksPayload } from "../orchestration/contracts/ActionPayloadSchemas";
import {
  assertReadDbReady,
  buildUserIdMatcher,
  clampPagination,
  escapeSearchRegex,
  redactInternalFields,
  STAGE1_READ_QUERY_TIMEOUT_MS,
  validateCalendarDate,
} from "./readQueryUtils";

export interface TaskQueryResult {
  items: Record<string, any>[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  emptyReason: string;
  appliedFilter: Record<string, any>;
}

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

  /**
   * Stage 1 bounded, tenant-scoped task query with fail-closed DB & date checks.
   */
  async queryTasks(userId: string, filter: QueryTasksPayload = {}): Promise<TaskQueryResult> {
    assertReadDbReady("lifeos.tasks.query");

    if (filter.dueDateFrom) {
      const check = validateCalendarDate(filter.dueDateFrom);
      if (!check.valid) throw new Error(`[INVALID_PARAMETER]: dueDateFrom: ${check.reason}`);
    }
    if (filter.dueDateTo) {
      const check = validateCalendarDate(filter.dueDateTo);
      if (!check.valid) throw new Error(`[INVALID_PARAMETER]: dueDateTo: ${check.reason}`);
    }
    if (filter.dueDateFrom && filter.dueDateTo && filter.dueDateTo < filter.dueDateFrom) {
      throw new Error(
        `[INVALID_DATE_RANGE]: dueDateTo (${filter.dueDateTo}) must be on or after dueDateFrom (${filter.dueDateFrom}).`
      );
    }

    const userMatcher = buildUserIdMatcher(userId, "MIXED");
    const mongoFilter: Record<string, any> = { userId: userMatcher };

    if (filter.status && filter.status !== "all") {
      mongoFilter.status = filter.status;
    }

    if (filter.priority) {
      mongoFilter.priority = filter.priority;
    }

    if (filter.goalId) {
      mongoFilter.goalId = filter.goalId;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (filter.overdue === true) {
      mongoFilter.dueDate = { $lt: todayStr };
      if (!filter.status || filter.status === "all") {
        mongoFilter.status = { $in: ["pending", "in_progress", "waiting", "blocked"] };
      }
    } else if (filter.dueDateFrom || filter.dueDateTo) {
      const dueDateRange: Record<string, string> = {};
      if (filter.dueDateFrom) dueDateRange.$gte = filter.dueDateFrom;
      if (filter.dueDateTo) dueDateRange.$lte = filter.dueDateTo;
      mongoFilter.dueDate = dueDateRange;
    }

    if (filter.search && filter.search.trim().length > 0) {
      const regex = new RegExp(escapeSearchRegex(filter.search.trim()), "i");
      mongoFilter.$or = [{ title: regex }, { description: regex }];
    }

    const { limit, offset } = clampPagination(filter.limit, filter.offset, 50, 100, 5000);
    const sortField = filter.sortBy || "dueDate";
    const sortDir = filter.sortOrder === "desc" ? -1 : 1;

    const projection: Record<string, number> = {
      _id: 1,
      userId: 1,
      title: 1,
      description: 1,
      dueDate: 1,
      dueTime: 1,
      priority: 1,
      status: 1,
      completedAt: 1,
      goalId: 1,
      parentTaskId: 1,
      recurring: 1,
      metadata: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    if (filter.includeSubtasks) {
      projection.subtasks = 1;
    }

    const [totalCount, docs] = await Promise.all([
      Task.countDocuments(mongoFilter).maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS),
      Task.find(mongoFilter)
        .select(projection)
        .sort({ [sortField]: sortDir, _id: 1 })
        .skip(offset)
        .limit(limit)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec(),
    ]);

    const items = (docs as Record<string, any>[]).map((d) => redactInternalFields(d));
    const returnedCount = items.length;
    const hasMore = offset + returnedCount < totalCount;
    const emptyReason =
      totalCount === 0
        ? "NO_MATCHING_TASKS"
        : returnedCount === 0
          ? "OFFSET_BEYOND_RESULTS"
          : "NONE";

    return {
      items,
      totalCount,
      returnedCount,
      hasMore,
      emptyReason,
      appliedFilter: {
        status: filter.status || "all",
        overdue: Boolean(filter.overdue),
        priority: filter.priority,
        dueDateFrom: filter.dueDateFrom,
        dueDateTo: filter.dueDateTo,
        goalId: filter.goalId,
        limit,
        offset,
      },
    };
  }
}
