import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { TemporalOccurrence } from "@/server/db/models/TemporalOccurrence";
import { ExecutionChronicle } from "@/server/db/models/ExecutionChronicle";
import { TemporalTimelineEngine } from "@life-os/execution-kernel";

function getWeekDays(referenceDate: string): string[] {
  const [y, m, d] = referenceDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const yr = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, "0");
    const da = String(cur.getDate()).padStart(2, "0");
    days.push(`${yr}-${mo}-${da}`);
  }
  return days;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { searchParams } = new URL(req.url);
    const dateOnly = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const timezone = searchParams.get("timezone") || "UTC";
    const view = searchParams.get("view") || "day";

    const engine = TemporalTimelineEngine.getInstance();
    const { Task } = await import("@/server/db/models/Task");

    // ─── WEEK OR AGENDA VIEW ───
    if (view === "week" || view === "agenda") {
      const weekDays = getWeekDays(dateOnly);
      const startDate = weekDays[0];
      const endDate = weekDays[6];

      const weekStartMs = new Date(`${startDate}T00:00:00Z`).getTime() - 6 * 3600 * 1000;
      const weekEndMs = new Date(`${endDate}T23:59:59Z`).getTime() + 6 * 3600 * 1000;

      const [allOccurrences, allChronicles, allTasks] = await Promise.all([
        TemporalOccurrence.find({
          userId,
          dateOnly: { $in: weekDays },
          status: { $ne: "CANCELLED" },
        }).lean(),
        ExecutionChronicle.find({
          userId,
          startedAtMs: { $gte: weekStartMs, $lte: weekEndMs },
        }).lean(),
        Task.find({
          userId,
          dueDate: { $in: weekDays },
          status: { $ne: "skipped" },
        }).lean(),
      ]);

      const unscheduledTasks: Array<{
        id: string;
        title: string;
        priority: string;
        status: string;
        dueDate: string;
        dueTime?: string | null;
      }> = [];

      const daysProjections = weekDays.map((day) => {
        const dayOccurrences = allOccurrences.filter((o: any) => o.dateOnly === day);
        const dayStartMs = new Date(`${day}T00:00:00Z`).getTime() - 6 * 3600 * 1000;
        const dayEndMs = new Date(`${day}T23:59:59Z`).getTime() + 6 * 3600 * 1000;
        const dayChronicles = allChronicles.filter(
          (c: any) => c.startedAtMs >= dayStartMs && c.startedAtMs <= dayEndMs
        );
        const dayTasks = allTasks.filter((t: any) => t.dueDate === day);

        const effectiveOccurrences: any[] = [...dayOccurrences];

        for (const t of dayTasks) {
          const isAlreadyRepresented = dayOccurrences.some(
            (o: any) =>
              o.linkedEntity?.entityId === String(t._id) ||
              o.title?.toLowerCase() === t.title?.toLowerCase()
          );

          if (!isAlreadyRepresented) {
            if (t.dueTime && typeof t.dueTime === "string" && t.dueTime.includes(":")) {
              const [h, m] = t.dueTime.split(":").map(Number);
              const startMinute = (h || 0) * 60 + (m || 0);
              effectiveOccurrences.push({
                occurrenceId: `task_${t._id}`,
                userId,
                title: t.title,
                kind: "WORK_SESSION",
                dateOnly: day,
                plannedInterval: {
                  dateOnly: day,
                  startMinute,
                  endMinute: Math.min(1439, startMinute + 45),
                  durationMinutes: 45,
                  startIsoUtc: `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`,
                  endIsoUtc: `${day}T${String(Math.floor((startMinute + 45) / 60)).padStart(2, "0")}:${String((startMinute + 45) % 60).padStart(2, "0")}:00Z`,
                  timezone,
                  isMidnightCrossing: false,
                },
                locationContext: { category: "HOME", requiresPhysicalTransit: false },
                rigidity: "ELASTIC",
                status: t.status === "completed" ? "COMPLETED" : "SCHEDULED",
                linkedEntity: { entityType: "task", entityId: String(t._id), taskTitle: t.title },
                version: 1,
                overrideType: "NONE",
              });
            } else {
              unscheduledTasks.push({
                id: String(t._id),
                title: t.title,
                priority: t.priority || "medium",
                status: t.status,
                dueDate: t.dueDate,
                dueTime: t.dueTime || null,
              });
            }
          }
        }

        return engine.projectDayTimeline(
          userId,
          day,
          effectiveOccurrences as any,
          dayChronicles as any,
          timezone
        );
      });

      return apiSuccess({
        view,
        startDate,
        endDate,
        days: daysProjections,
        unscheduledTasks,
      });
    }

    // ─── SINGLE DAY VIEW ───
    const occurrences = await TemporalOccurrence.find({
      userId,
      dateOnly,
      status: { $ne: "CANCELLED" },
    }).lean();

    const dayStartMs = new Date(`${dateOnly}T00:00:00Z`).getTime() - 6 * 3600 * 1000;
    const dayEndMs = new Date(`${dateOnly}T23:59:59Z`).getTime() + 6 * 3600 * 1000;

    const chronicles = await ExecutionChronicle.find({
      userId,
      startedAtMs: { $gte: dayStartMs, $lte: dayEndMs },
    }).lean();

    const tasks = await Task.find({
      userId,
      dueDate: dateOnly,
      status: { $ne: "skipped" },
    }).lean();

    const unscheduledTasks: Array<{
      id: string;
      title: string;
      priority: string;
      status: string;
      dueDate: string;
      dueTime?: string | null;
    }> = [];

    const effectiveOccurrences: any[] = [...occurrences];

    for (const t of tasks) {
      const isAlreadyRepresented = occurrences.some(
        (o: any) =>
          o.linkedEntity?.entityId === String(t._id) ||
          o.title?.toLowerCase() === t.title?.toLowerCase()
      );

      if (!isAlreadyRepresented) {
        if (t.dueTime && typeof t.dueTime === "string" && t.dueTime.includes(":")) {
          const [h, m] = t.dueTime.split(":").map(Number);
          const startMinute = (h || 0) * 60 + (m || 0);
          effectiveOccurrences.push({
            occurrenceId: `task_${t._id}`,
            userId,
            title: t.title,
            kind: "WORK_SESSION",
            dateOnly,
            plannedInterval: {
              dateOnly,
              startMinute,
              endMinute: Math.min(1439, startMinute + 45),
              durationMinutes: 45,
              startIsoUtc: `${dateOnly}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`,
              endIsoUtc: `${dateOnly}T${String(Math.floor((startMinute + 45) / 60)).padStart(2, "0")}:${String((startMinute + 45) % 60).padStart(2, "0")}:00Z`,
              timezone,
              isMidnightCrossing: false,
            },
            locationContext: { category: "HOME", requiresPhysicalTransit: false },
            rigidity: "ELASTIC",
            status: t.status === "completed" ? "COMPLETED" : "SCHEDULED",
            linkedEntity: { entityType: "task", entityId: String(t._id), taskTitle: t.title },
            version: 1,
            overrideType: "NONE",
          });
        } else {
          unscheduledTasks.push({
            id: String(t._id),
            title: t.title,
            priority: t.priority || "medium",
            status: t.status,
            dueDate: t.dueDate,
            dueTime: t.dueTime || null,
          });
        }
      }
    }

    const projection = engine.projectDayTimeline(
      userId,
      dateOnly,
      effectiveOccurrences as any,
      chronicles as any,
      timezone
    );

    return apiSuccess({
      ...projection,
      unscheduledTasks,
    });
  } catch (err: any) {
    console.error("GET /api/calendar/timeline Error:", err);
    return apiError(err.message || "Failed to project timeline", "INTERNAL_ERROR", 500);
  }
}
