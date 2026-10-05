import {
  InteractionSurfaceService,
  IInteractionSurfaceProjection,
  TemporalOccurrence,
  ExecutionChronicleEntry,
  getActiveDate,
  parseLocalToUTC,
} from "@life-os/execution-kernel";
import { connectDB } from "@/server/db/connect";

export async function fetchAuthoritativeSurfaceProjection(
  userId: string,
  timezoneHint?: string
): Promise<IInteractionSurfaceProjection> {
  await connectDB();

  const now = Date.now();
  const { User } = await import("@/server/db/models/User");
  const userDoc = await User.findById(userId).select("settings").lean();
  const userTimezone =
    timezoneHint || (userDoc as any)?.settings?.timezone || "UTC";

  const todayDateOnly = getActiveDate(userTimezone, 4, new Date(now));

  const { TemporalOccurrence: TemporalOccModel } = await import(
    "@/server/db/models/TemporalOccurrence"
  );
  const { ExecutionChronicle: ChronicleModel } = await import(
    "@/server/db/models/ExecutionChronicle"
  );
  const { Task: TaskModel } = await import("@/server/db/models/Task");

  const [occurrencesDocs, chroniclesDocs, pendingTasks] = await Promise.all([
    TemporalOccModel.find({
      userId,
      dateOnly: todayDateOnly,
    }).lean(),
    ChronicleModel.find({
      userId,
      startedAtMs: { $gte: now - 24 * 60 * 60 * 1000 },
    })
      .sort({ startedAtMs: -1 })
      .limit(20)
      .lean(),
    TaskModel.find({
      userId,
      status: "pending",
      dueDate: todayDateOnly,
    }).lean(),
  ]);

  const occurrences: TemporalOccurrence[] = (occurrencesDocs as any[]).map(
    (doc) => ({
      occurrenceId: doc.occurrenceId,
      userId: doc.userId,
      seriesId: doc.seriesId,
      title: doc.title,
      kind: doc.kind,
      dateOnly: doc.dateOnly,
      plannedInterval: doc.plannedInterval,
      locationContext: doc.locationContext,
      rigidity: doc.rigidity,
      status: doc.status,
      linkedEntity: doc.linkedEntity,
      version: doc.version,
      overrideType: doc.overrideType,
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : now,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : now,
    })
  );

  // Synthesize TemporalOccurrences for today's pending tasks that have a dueTime
  for (const task of pendingTasks as any[]) {
    if (task.dueTime) {
      try {
        const startUtc = parseLocalToUTC(
          task.dueDate || todayDateOnly,
          task.dueTime,
          userTimezone
        );
        const [sh, sm] = String(task.dueTime).split(":").map(Number);
        const startMinute = (sh || 0) * 60 + (sm || 0);
        const durationMinutes = task.metadata?.estimatedDuration || 15;
        const endMinute = Math.min(1439, startMinute + durationMinutes);
        const endUtc = new Date(startUtc.getTime() + durationMinutes * 60 * 1000);
        occurrences.push({
          occurrenceId: `task_occ_${task._id}`,
          userId: String(task.userId),
          title: task.title,
          kind: "WORK_SESSION",
          dateOnly: task.dueDate || todayDateOnly,
          plannedInterval: {
            dateOnly: task.dueDate || todayDateOnly,
            startMinute,
            endMinute,
            durationMinutes,
            startIsoUtc: startUtc.toISOString(),
            endIsoUtc: endUtc.toISOString(),
            timezone: userTimezone,
            isMidnightCrossing: false,
          },
          locationContext: {
            category: "CUSTOM",
            label: "LifeOS Task",
            requiresPhysicalTransit: false,
          },
          rigidity: "ELASTIC",
          status: "SCHEDULED",
          linkedEntity: { entityType: "task", entityId: String(task._id) },
          version: 1,
          overrideType: "NONE",
          createdAt: task.createdAt ? new Date(task.createdAt).getTime() : now,
          updatedAt: task.updatedAt ? new Date(task.updatedAt).getTime() : now,
        });
      } catch (_) {}
    }
  }

  const chronicles: ExecutionChronicleEntry[] = (chroniclesDocs as any[]).map(
    (doc) => ({
      chronicleId: doc.chronicleId,
      userId: doc.userId,
      occurrenceId: doc.occurrenceId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      startedAtMs: doc.startedAtMs,
      endedAtMs: doc.endedAtMs,
      durationMinutes: doc.durationMinutes,
      interruptionsCount: doc.interruptionsCount || 0,
      completedWorkUnits: doc.completedWorkUnits,
      notes: doc.notes,
      source: doc.source || "web_manual",
      createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : now,
    })
  );

  const surfaceService = InteractionSurfaceService.getInstance();
  return await surfaceService.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences,
    chronicles,
  });
}
