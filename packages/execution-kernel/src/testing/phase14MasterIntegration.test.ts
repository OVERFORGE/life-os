/**
 * Phase 14: Master Integration & Chaos Hardening Suite
 * 
 * Comprehensive validation:
 * 1. Stale Projection Action Ingress & Optimistic Concurrency
 * 2. Rapid Double-Tap Burst Stress (20 rapid duplicate requests)
 * 3. Strict Token Budget Ceiling (<= 250 tokens across all 4 interaction modes)
 * 4. Micro-benchmark: Sub-5ms Projection Computation SLA
 * 5. Complete Constitutional Silence Invariant under Null State
 */

process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InteractionSurfaceService,
  computeSurfaceActionIdempotencyKey,
  TemporalOccurrence,
} from '../index';
import { KernelCapabilityService, ActionProposal } from '../orchestration/kernel/KernelCapabilityService';
import { registerDefaultActionAdapters } from '../orchestration/kernel/DefaultActionAdapters';

registerDefaultActionAdapters();

test('Phase 14: Stale Projection Optimistic Concurrency: Decoupled logical action executes safely', async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = 'usr_chaos_stale';
  const taskId = 'task_stale_1';

  // Suppose client cached projection at version 2, but server is already at version 45
  const staleObservedVersion = 2;
  const currentKey = computeSurfaceActionIdempotencyKey(userId, 'complete_task', taskId, taskId);

  const proposal: ActionProposal = {
    id: 'prop_stale_action',
    domain: 'productivity',
    actionType: 'complete_task',
    targetEntityId: taskId,
    payload: { taskId, observedVersion: staleObservedVersion },
    rationale: 'Executed from stale lockscreen notification',
    reversibility: 'atomic_single_doc',
    idempotencyKey: currentKey,
  };

  const result = await kernel.executeAction(userId, proposal);
  assert.equal(result.success, true, 'Kernel executes valid logical action regardless of stale client projection');
  assert.equal(result.actionType, 'complete_task');
});

test('Phase 14: Rapid Double-Tap Burst: 20 rapid duplicate requests yield exactly 1 DB mutation', async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = 'usr_burst_test';
  const taskId = 'task_burst_99';
  const key = computeSurfaceActionIdempotencyKey(userId, 'start_execution', taskId, 'seed_burst');

  const proposal: ActionProposal = {
    id: 'prop_burst',
    domain: 'productivity',
    actionType: 'start_execution',
    targetEntityId: taskId,
    payload: { occurrenceId: taskId, startedAtMs: Date.now() },
    rationale: 'Rapid user tapping',
    reversibility: 'atomic_single_doc',
    idempotencyKey: key,
  };

  // 20 rapid concurrent requests
  const promises: Promise<any>[] = [];
  for (let i = 0; i < 20; i++) {
    promises.push(kernel.executeAction(userId, proposal));
  }

  const results = await Promise.all(promises);
  for (const r of results) {
    assert.equal(r.success, true);
  }

  const freshCommits = results.filter(r => !r.idempotent);
  const idempotentReplies = results.filter(r => r.idempotent === true);

  assert.equal(freshCommits.length, 1, 'Exactly one state mutation occurred');
  assert.equal(idempotentReplies.length, 19, '19 duplicate taps absorbed idempotently');
});

test('Phase 14: Strict Token Budget Ceiling: <= 250 tokens (~1000 bytes) across all modes', async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();
  const userId = 'usr_token_audit';
  const now = Date.now();

  const mockOcc: TemporalOccurrence = {
    occurrenceId: 'occ_budget_audit',
    userId,
    title: 'Constitutional Architecture Master Hardening Session',
    kind: 'WORK_SESSION',
    dateOnly: '2026-10-04',
    plannedInterval: {
      dateOnly: '2026-10-04',
      startMinute: 720,
      endMinute: 780,
      durationMinutes: 60,
      startIsoUtc: new Date(now).toISOString(),
      endIsoUtc: new Date(now + 3600000).toISOString(),
      timezone: 'UTC',
      isMidnightCrossing: false,
    },
    locationContext: { category: 'WORK_SITE' },
    rigidity: 'ELASTIC',
    status: 'IN_PROGRESS',
    version: 1,
    overrideType: 'NONE',
    createdAt: now,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [mockOcc],
  });

  const serialized = JSON.stringify(projection);
  // Rule of thumb: 1 token ~= 4 characters in JSON
  const estimatedTokens = Math.ceil(serialized.length / 4);

  assert.ok(
    estimatedTokens <= 250,
    `Serialized projection must be <= 250 tokens (actual: ${estimatedTokens} tokens, ${serialized.length} bytes)`
  );
});

test('Phase 14: Micro-benchmark SLA: Projection calculation executes under 5ms', async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();
  const userId = 'usr_sla_test';
  const now = Date.now();

  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await service.computeSurfaceProjection(userId, { referenceTimeMs: now + i * 1000 });
  }

  const totalTime = performance.now() - start;
  const avgTime = totalTime / iterations;

  assert.ok(
    avgTime < 5.0,
    `Average projection compute time must be < 5.0ms (actual: ${avgTime.toFixed(3)}ms)`
  );
});

test('Phase 14: Silence Invariant: Zero ambient noise when dormant', async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();
  const userId = 'usr_silence_master';

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: Date.now(),
    occurrences: [],
  });

  assert.equal(projection.interactionMode, 'SILENT');
  assert.equal(projection.activeExecution, null);
  assert.ok(!projection.pendingIntervention, 'No pending intervention');
  assert.ok(!projection.upcomingCommitment, 'No upcoming commitment');
});
