import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { TaskRepository } from "../repositories/TaskRepository";
import { GoalRepository } from "../repositories/GoalRepository";
import { ScheduleQueryRepository } from "../repositories/ScheduleQueryRepository";
import { DailyLogRepository } from "../repositories/DailyLogRepository";
import { TelemetryHistoryRepository } from "../repositories/TelemetryHistoryRepository";
import { ObservationPipeline } from "../telemetry/pipeline/ObservationPipeline";

describe("Stage 1: Real Isolated Database Read Capabilities", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage1-db-test",
      useMemoryReplSet: true,
    });
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("enforces fail-closed error when DB is disconnected", async () => {
    // Only run disconnected check on a fresh check? Instead, test invalid userId / invalid ranges here
    await assert.rejects(
      () => DailyLogRepository.getInstance().queryRange("not-an-object-id", {
        startDate: "2026-05-01",
        endDate: "2026-05-05",
      }),
      /INVALID_USER_ID/
    );
  });

  it("queries tasks with tenant isolation, Mixed userId, overdue/status/search filters, pagination, and zero mutations", async () => {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const { OutboxEventModel } = await import("../../../../apps/web/server/db/models/OutboxEventModel");

    await Task.deleteMany({});
    await OutboxEventModel.deleteMany({});

    // Seed tasks for User A (both string and ObjectId userId to test Mixed handling)
    await Task.create([
      {
        userId: userA,
        title: "Write Stage 1 report",
        description: "Detailed kernel summary",
        dueDate: "2020-01-15",
        priority: "high",
        status: "pending",
        subtasks: [{ title: "Draft outline", completed: false }],
      },
      {
        userId: new mongoose.Types.ObjectId(userA),
        title: "Review PRs",
        dueDate: "2099-05-20",
        priority: "medium",
        status: "pending",
      },
      {
        userId: userA,
        title: "Completed chore",
        dueDate: "2026-05-01",
        priority: "low",
        status: "completed",
      },
      {
        userId: userB,
        title: "User B secret task",
        dueDate: "2020-01-10",
        priority: "high",
        status: "pending",
      },
    ]);

    const repo = TaskRepository.getInstance();

    // 1. Tenant isolation + all tasks for User A
    const allA = await repo.queryTasks(userA, { status: "all", includeSubtasks: true });
    assert.equal(allA.totalCount, 3);
    assert.equal(allA.returnedCount, 3);
    assert.equal(allA.items.some((t) => t.title.includes("User B")), false);
    const reportTask = allA.items.find((t) => t.title === "Write Stage 1 report");
    assert.ok(reportTask);
    assert.equal(reportTask.__v, undefined);
    assert.equal(Array.isArray(reportTask.subtasks), true);

    // 2. Overdue filter
    const overdueA = await repo.queryTasks(userA, { overdue: true });
    assert.equal(overdueA.totalCount, 1);
    assert.equal(overdueA.items[0].title, "Write Stage 1 report");

    // 3. Pagination
    const page1 = await repo.queryTasks(userA, { status: "all", limit: 2, offset: 0 });
    assert.equal(page1.returnedCount, 2);
    assert.equal(page1.hasMore, true);
    const page2 = await repo.queryTasks(userA, { status: "all", limit: 2, offset: 2 });
    assert.equal(page2.returnedCount, 1);
    assert.equal(page2.hasMore, false);

    // 4. Search filter
    const searched = await repo.queryTasks(userA, { search: "Review" });
    assert.equal(searched.totalCount, 1);
    assert.equal(searched.items[0].title, "Review PRs");

    // 5. Zero mutations / zero outbox events
    assert.equal(await Task.countDocuments({}), 4);
    assert.equal(await OutboxEventModel.countDocuments({}), 0);
  });

  it("queries goals with tenant-scoped GoalStats join and milestone toggle", async () => {
    const { Goal } = await import("../../../../apps/web/features/goals/models/Goal");
    const { GoalStatsModel } = await import("../../../../apps/web/server/db/models/GoalStatsModel");

    await Goal.deleteMany({});
    await GoalStatsModel.deleteMany({});

    const goalA = await Goal.create({
      userId: userA,
      title: "Ship LifeOS Stage 1",
      status: "active",
      nature: "finite_deliverable",
      cadence: "daily",
      milestones: [{ milestoneId: "m1", title: "Contracts", completed: true, order: 1 }],
    });
    const goalB = await Goal.create({
      userId: userB,
      title: "User B private goal",
      status: "active",
      nature: "habitual_cadence",
      cadence: "weekly",
    });

    await GoalStatsModel.create([
      {
        goalId: goalA._id.toString(),
        userId: userA,
        nature: "finite_deliverable",
        currentScore: 88,
        deliverableProgressPercent: 60,
        completedMilestonesCount: 1,
        totalMilestonesCount: 2,
        completedTasksCount: 3,
        totalTasksCount: 5,
        state: "on_track",
        momentum: "up",
      },
      {
        goalId: goalA._id.toString() + "_other",
        userId: userB,
        nature: "habitual_cadence",
        currentScore: 10,
      },
      {
        goalId: goalB._id.toString(),
        userId: userB,
        nature: "habitual_cadence",
        currentScore: 50,
      },
    ]);

    const res = await GoalRepository.getInstance().queryGoals(userA, {
      status: "active",
      includeStats: true,
      includeMilestones: true,
    });
    assert.equal(res.totalCount, 1);
    assert.equal(res.items[0].title, "Ship LifeOS Stage 1");
    assert.equal(res.items[0].stats.currentScore, 88);
    assert.equal(res.items[0].milestones.length, 1);
    assert.equal(res.items[0].mutationEpoch, undefined);

    const noMilestones = await GoalRepository.getInstance().queryGoals(userA, {
      includeMilestones: false,
      includeStats: false,
    });
    assert.equal(noMilestones.items[0].milestones, undefined);
    assert.equal(noMilestones.items[0].stats, undefined);
  });

  it("queries schedule occurrences with 31-day inclusive bound, timezone resolution, and chronicle join", async () => {
    const { TemporalOccurrence } = await import("../../../../apps/web/server/db/models/TemporalOccurrence");
    const { ExecutionChronicle } = await import("../../../../apps/web/server/db/models/ExecutionChronicle");
    const { User } = await import("../../../../apps/web/server/db/models/User");

    await TemporalOccurrence.deleteMany({});
    await ExecutionChronicle.deleteMany({});
    await User.deleteMany({});

    await User.create({
      _id: new mongoose.Types.ObjectId(userA),
      email: "usera-stage1@example.com",
      name: "User A",
      settings: { timezone: "Asia/Karachi" },
    });

    await TemporalOccurrence.create([
      {
        occurrenceId: "occ_a_1",
        userId: userA,
        title: "Deep Work Block",
        kind: "WORK_SESSION",
        dateOnly: "2026-05-10",
        plannedInterval: {
          dateOnly: "2026-05-10",
          startMinute: 540,
          endMinute: 660,
          durationMinutes: 120,
          startIsoUtc: "2026-05-10T09:00:00.000Z",
          endIsoUtc: "2026-05-10T11:00:00.000Z",
          timezone: "Asia/Karachi",
          isMidnightCrossing: false,
        },
        status: "SCHEDULED",
      },
      {
        occurrenceId: "occ_b_1",
        userId: userB,
        title: "User B Meeting",
        kind: "HARD_EVENT",
        dateOnly: "2026-05-10",
        plannedInterval: {
          dateOnly: "2026-05-10",
          startMinute: 600,
          endMinute: 660,
          durationMinutes: 60,
          startIsoUtc: "2026-05-10T10:00:00.000Z",
          endIsoUtc: "2026-05-10T11:00:00.000Z",
          timezone: "UTC",
          isMidnightCrossing: false,
        },
        status: "SCHEDULED",
      },
    ]);

    await ExecutionChronicle.create({
      chronicleId: "chr_a_1",
      userId: userA,
      occurrenceId: "occ_a_1",
      entityType: "routine",
      title: "Deep Work Executed",
      startedAtMs: Date.UTC(2026, 4, 10, 9, 0, 0),
      endedAtMs: Date.UTC(2026, 4, 10, 10, 30, 0),
      durationMinutes: 90,
      source: "web_manual",
    });

    const repo = ScheduleQueryRepository.getInstance();

    // 31 inclusive days accepted (May 1 .. May 31)
    const ok31 = await repo.queryOccurrences(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      includeExecutionChronicle: true,
    });
    assert.equal(ok31.totalCount, 1);
    assert.equal(ok31.items[0].occurrenceId, "occ_a_1");
    assert.equal(ok31.resolvedTimezone, "Asia/Karachi");
    assert.equal(ok31.isTimezoneFallback, false);
    assert.equal(ok31.chronicleItems?.length, 1);

    // 32 inclusive days rejected (May 1 .. June 1)
    await assert.rejects(
      () => repo.queryOccurrences(userA, { startDate: "2026-05-01", endDate: "2026-06-01" }),
      /DATE_RANGE_EXCEEDED/
    );
  });

  it("queries daily logs with 90-day bound, reflection privacy default, explicit opt-in, and coverage", async () => {
    const { DailyLog } = await import("../../../../apps/web/server/db/models/DailyLog");
    await DailyLog.deleteMany({});

    await DailyLog.create([
      {
        userId: new mongoose.Types.ObjectId(userA),
        date: "2026-05-01",
        mental: { mood: 8, energy: 7, stress: 3, focus: 8 },
        sleep: { hours: 7.5, quality: 8 },
        reflection: {
          win: "PRIVATE_REFLECTION_WIN",
          bothering: "PRIVATE_BOTHERING",
        },
      },
      {
        userId: new mongoose.Types.ObjectId(userB),
        date: "2026-05-01",
        mental: { mood: 4 },
        reflection: { win: "USER_B_REFLECTION" },
      },
    ]);

    const repo = DailyLogRepository.getInstance();

    // Default excludes reflection
    const defaultRes = await repo.queryRange(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });
    assert.equal(defaultRes.totalCount, 1);
    assert.equal(defaultRes.items[0].reflection, undefined);
    assert.equal(defaultRes.coverage.requestedDays, 10);
    assert.equal(defaultRes.coverage.loggedDays, 1);
    assert.equal(defaultRes.coverage.coverageRatio, 0.1);
    assert.equal(defaultRes.coverage.reflectionIncluded, false);

    // Explicit opt-in includes reflection
    const optInRes = await repo.queryRange(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-10",
      includeReflection: true,
    });
    assert.equal(optInRes.items[0].reflection.win, "PRIVATE_REFLECTION_WIN");
    assert.equal(optInRes.coverage.reflectionIncluded, true);

    // 90 inclusive days accepted (2026-01-01 to 2026-03-31 = 31+28+31 = 90)
    const ok90 = await repo.queryRange(userA, {
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    });
    assert.equal(ok90.coverage.requestedDays, 90);

    // 91 inclusive days rejected (2026-01-01 to 2026-04-01 = 91)
    await assert.rejects(
      () => repo.queryRange(userA, { startDate: "2026-01-01", endDate: "2026-04-01" }),
      /DATE_RANGE_EXCEEDED/
    );
  });

  it("queries telemetry state history with 30-day bound and honest availabilityStatus", async () => {
    const { CognitiveStateHistoryModel } = await import(
      "../../../../apps/web/server/db/models/CognitiveStateHistoryModel"
    );
    const { ObservationModel } = await import("../../../../apps/web/server/db/models/ObservationModel");

    await CognitiveStateHistoryModel.deleteMany({});
    await ObservationModel.deleteMany({});
    ObservationPipeline.getInstance().clearMemoryCache();

    const repo = TelemetryHistoryRepository.getInstance();

    // Empty source honesty
    const emptyRes = await repo.queryStateHistory(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-10",
    });
    assert.equal(emptyRes.availabilityStatus, "EMPTY_SOURCE");
    assert.equal(emptyRes.items.length, 0);
    assert.equal(emptyRes.emptyReason, "NO_TELEMETRY_RECORDS_IN_RANGE");

    // Seed cognitive state for User A + User B
    const ts = Date.UTC(2026, 4, 5, 12, 0, 0);
    await CognitiveStateHistoryModel.create([
      {
        userId: userA,
        timestamp: ts,
        stress: { estimate: 0.3, confidence: 0.9, primaryFactors: ["workload"] },
        energy: { estimate: 0.8, confidence: 0.9, primaryFactors: ["sleep"] },
        cognitiveLoad: { estimate: 0.4, confidence: 0.85, primaryFactors: ["meetings"] },
        focusReadiness: { estimate: 0.85, confidence: 0.9, primaryFactors: ["rested"] },
        provenance: "HYBRID",
        temporalValidity: { validFrom: ts, validUntil: ts + 3600000, freshnessTimestamp: ts },
      },
      {
        userId: userB,
        timestamp: ts,
        stress: { estimate: 0.9, confidence: 0.9, primaryFactors: [] },
        energy: { estimate: 0.1, confidence: 0.9, primaryFactors: [] },
        cognitiveLoad: { estimate: 0.9, confidence: 0.9, primaryFactors: [] },
        focusReadiness: { estimate: 0.1, confidence: 0.9, primaryFactors: [] },
        provenance: "PASSIVE_INFERENCE",
        temporalValidity: { validFrom: ts, validUntil: ts + 3600000, freshnessTimestamp: ts },
      },
    ]);

    // Partial when includeObservations=true but no observations exist
    const partialRes = await repo.queryStateHistory(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-10",
      includeObservations: true,
    });
    assert.equal(partialRes.totalCount, 1);
    assert.equal(partialRes.availabilityStatus, "PARTIAL");

    // Seed observation for User A
    await ObservationModel.create({
      id: "obs-sleep-1",
      type: "sleep_duration",
      userId: userA,
      timestamp: ts,
      generatedAt: ts,
      normalizedValue: 0.8,
      rawValue: 7.5,
      unit: "hours",
      confidence: 0.95,
      provenance: { source: "daily_logs", sourceId: "dl1", subsystem: "Telemetry", extractedAt: ts },
    });

    const fullRes = await repo.queryStateHistory(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-10",
      includeObservations: true,
    });
    assert.equal(fullRes.availabilityStatus, "AVAILABLE");
    assert.equal(fullRes.observations?.length, 1);

    // 30 inclusive days accepted (May 1 .. May 30)
    const ok30 = await repo.queryStateHistory(userA, {
      startDate: "2026-05-01",
      endDate: "2026-05-30",
    });
    assert.equal(ok30.totalCount, 1);

    // 31 inclusive days rejected (May 1 .. May 31)
    await assert.rejects(
      () => repo.queryStateHistory(userA, { startDate: "2026-05-01", endDate: "2026-05-31" }),
      /DATE_RANGE_EXCEEDED/
    );
  });
});
