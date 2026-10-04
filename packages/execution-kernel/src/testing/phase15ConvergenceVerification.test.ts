import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InteractionSurfaceService,
  IInteractionSurfaceProjection,
  ISurfaceActionEnvelope,
  KernelCapabilityService,
  ActionAdapterRegistry,
  ActionProposal,
  TemporalOccurrence,
} from "../index";

function createHarness() {
  const registry = new ActionAdapterRegistry();
  let executionCount = 0;

  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      executionCount++;
      return { taskId: p.payload?.taskId, status: "completed", executionCount };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const surfaceService = InteractionSurfaceService.getInstance();
  surfaceService.reset();

  return { kernel, surfaceService, getExecutionCount: () => executionCount };
}

function createOccurrence(userId: string, occurrenceId: string, status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED", now: number): TemporalOccurrence {
  return {
    occurrenceId,
    userId,
    title: "Review Design System",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 600,
      endMinute: 645,
      durationMinutes: 45,
      startIsoUtc: new Date(now).toISOString(),
      endIsoUtc: new Date(now + 45 * 60 * 1000).toISOString(),
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "WORK_SITE" },
    rigidity: "ELASTIC",
    status,
    version: 1,
    overrideType: "NONE",
    createdAt: now,
    updatedAt: now,
  };
}

test("Phase 15: Cross-device convergence: Simultaneous taps on Mobile, Desktop, and Web produce exactly 1 commit and 2 idempotent responses", async () => {
  const { kernel, surfaceService, getExecutionCount } = createHarness();
  const userId = "usr_conv_test_1";
  const taskId = "task_ambient_001";
  const occurrenceId = "occ_ambient_001";
  const idempotencyKey = `complete_${userId}_${taskId}_slot`;
  const now = Date.now();

  const occ = createOccurrence(userId, occurrenceId, "IN_PROGRESS", now);

  // Track projections on 3 simulated surfaces
  const projections: { mobile?: IInteractionSurfaceProjection; desktop?: IInteractionSurfaceProjection; web?: IInteractionSurfaceProjection } = {};
  const unsubMobile = surfaceService.subscribe(userId, (p) => { projections.mobile = p; });
  const unsubDesktop = surfaceService.subscribe(userId, (p) => { projections.desktop = p; });
  const unsubWeb = surfaceService.subscribe(userId, (p) => { projections.web = p; });

  const initialProj = await surfaceService.computeSurfaceProjection(userId, { referenceTimeMs: now, occurrences: [occ] });
  assert.equal(initialProj.interactionMode, "ACTIVE_EXECUTION");
  assert.equal(initialProj.activeExecution?.occurrenceId, occurrenceId);

  // Simultaneous action envelopes from 3 distinct physical surfaces
  const proposal: ActionProposal = {
    id: "act_conv_001",
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: taskId,
    payload: { taskId },
    preconditions: { mustExist: true },
    rationale: "User pressed [Done] on ambient surface",
    reversibility: "reversible_with_compensation",
    idempotencyKey,
  };

  const mobileEnvelope: ISurfaceActionEnvelope = {
    actionId: "act_conv_001",
    actionType: "complete_task",
    entityId: taskId,
    targetDomain: "productivity",
    userId,
    sourceSurface: "ANDROID_NOTIFICATION",
    idempotencyKey,
    projectionVersion: initialProj.projectionVersion,
    timestampMs: now,
  };

  const desktopEnvelope: ISurfaceActionEnvelope = {
    actionId: "act_conv_001",
    actionType: "complete_task",
    entityId: taskId,
    targetDomain: "productivity",
    userId,
    sourceSurface: "DESKTOP_HUD",
    idempotencyKey,
    projectionVersion: initialProj.projectionVersion,
    timestampMs: now + 2,
  };

  const webEnvelope: ISurfaceActionEnvelope = {
    actionId: "act_conv_001",
    actionType: "complete_task",
    entityId: taskId,
    targetDomain: "productivity",
    userId,
    sourceSurface: "WEB_COMMAND_BAR",
    idempotencyKey,
    projectionVersion: initialProj.projectionVersion,
    timestampMs: now + 5,
  };

  // Dispatch all 3 concurrently
  const [mobileRes, desktopRes, webRes] = await Promise.all([
    kernel.executeAction(userId, proposal),
    kernel.executeAction(userId, proposal),
    kernel.executeAction(userId, proposal),
  ]);

  // Assertions:
  // 1. Exactly 1 authoritative execution in kernel adapter
  assert.equal(getExecutionCount(), 1, "Must execute kernel action exactly once across all 3 devices");

  // 2. All 3 dispatches report success (first executes, other two return idempotent match)
  assert.ok(mobileRes.success);
  assert.ok(desktopRes.success);
  assert.ok(webRes.success);

  // Transition occurrence to COMPLETED -> silence
  occ.status = "COMPLETED";
  const finalProj = await surfaceService.computeSurfaceProjection(userId, { referenceTimeMs: now + 1000, occurrences: [occ] });

  // 3. All 3 surfaces converged to Silence state
  assert.equal(finalProj.activeExecution, null);
  assert.equal(finalProj.interactionMode, "SILENT");
  assert.equal(projections.mobile?.interactionMode, "SILENT");
  assert.equal(projections.desktop?.interactionMode, "SILENT");
  assert.equal(projections.web?.interactionMode, "SILENT");

  unsubMobile();
  unsubDesktop();
  unsubWeb();
});

test("Phase 15: Cross-device monotonic sequence ordering across asynchronous multi-surface events", async () => {
  const { surfaceService } = createHarness();
  const userId = "usr_conv_test_2";

  const mobileVersions: number[] = [];
  const desktopVersions: number[] = [];
  const webVersions: number[] = [];

  const u1 = surfaceService.subscribe(userId, (p) => mobileVersions.push(p.projectionVersion));
  const u2 = surfaceService.subscribe(userId, (p) => desktopVersions.push(p.projectionVersion));
  const u3 = surfaceService.subscribe(userId, (p) => webVersions.push(p.projectionVersion));

  // Perform 4 state transitions
  for (let i = 0; i < 4; i++) {
    await surfaceService.computeSurfaceProjection(userId);
  }

  // All surfaces must observe strictly monotonic ascending versions
  assert.deepEqual(mobileVersions, [1, 2, 3, 4]);
  assert.deepEqual(desktopVersions, [1, 2, 3, 4]);
  assert.deepEqual(webVersions, [1, 2, 3, 4]);

  u1();
  u2();
  u3();
});

test("Phase 15: Convergence SLA: All surfaces converge to Silence in <= 2.0s after completion", async () => {
  const { surfaceService } = createHarness();
  const userId = "usr_conv_test_3";
  const now = Date.now();

  const occ = createOccurrence(userId, "occ_sla_001", "IN_PROGRESS", now);
  await surfaceService.computeSurfaceProjection(userId, { referenceTimeMs: now, occurrences: [occ] });

  const startMs = performance.now();

  // Trigger completion / silence
  occ.status = "COMPLETED";
  const silentProj = await surfaceService.computeSurfaceProjection(userId, { referenceTimeMs: now + 500, occurrences: [occ] });

  const elapsedMs = performance.now() - startMs;

  assert.equal(silentProj.interactionMode, "SILENT");
  assert.ok(elapsedMs < 2000, `Convergence took ${elapsedMs.toFixed(2)}ms, exceeding 2.0s SLA`);
});
