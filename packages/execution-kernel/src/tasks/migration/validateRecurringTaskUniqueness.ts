/**
 * packages/execution-kernel/src/tasks/migration/validateRecurringTaskUniqueness.ts
 *
 * Preflight validation utility for Task recurrence unique partial index.
 * Detects duplicate (userId, recurringParentId, dueDate) tuples without performing destructive mutations.
 */

export interface DuplicateRecurrenceGroup {
  userId: string;
  recurringParentId: string;
  dueDate: string;
  count: number;
  taskIds: string[];
}

export interface RecurrenceValidationReport {
  totalRecurringTasks: number;
  uniqueSeriesDateTuples: number;
  duplicateCount: number;
  duplicates: DuplicateRecurrenceGroup[];
  isSafeForUniqueIndex: boolean;
}

export async function validateRecurringTaskUniqueness(
  taskModel: any
): Promise<RecurrenceValidationReport> {
  // Query only recurring task instances
  const cursor = taskModel.find({
    recurringParentId: { $exists: true, $ne: null },
  });

  const docs: any[] = typeof cursor.lean === "function" ? await cursor.lean() : await cursor;

  const groups = new Map<string, { userId: string; recurringParentId: string; dueDate: string; taskIds: string[] }>();

  for (const doc of docs) {
    const key = `${String(doc.userId)}:${String(doc.recurringParentId)}:${String(doc.dueDate)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.taskIds.push(String(doc._id));
    } else {
      groups.set(key, {
        userId: String(doc.userId),
        recurringParentId: String(doc.recurringParentId),
        dueDate: String(doc.dueDate),
        taskIds: [String(doc._id)],
      });
    }
  }

  const duplicates: DuplicateRecurrenceGroup[] = [];
  for (const group of groups.values()) {
    if (group.taskIds.length > 1) {
      duplicates.push({
        userId: group.userId,
        recurringParentId: group.recurringParentId,
        dueDate: group.dueDate,
        count: group.taskIds.length,
        taskIds: group.taskIds,
      });
    }
  }

  return {
    totalRecurringTasks: docs.length,
    uniqueSeriesDateTuples: groups.size,
    duplicateCount: duplicates.length,
    duplicates,
    isSafeForUniqueIndex: duplicates.length === 0,
  };
}

