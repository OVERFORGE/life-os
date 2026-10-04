/**
 * Phase 13: End-to-End Cross-Device Replay & Adversarial Concurrency Suite
 * 
 * Verifies:
 * 1. Complete Product Loop: DUE -> PROPOSAL -> START -> ACTIVE CHRONOMETER -> DONE -> SILENCE
 * 2. Adversarial Multi-Device Concurrency: Phone + Desktop + Web tap [Done] simultaneously
 * 3. Offline Queue Replay: Deterministic FIFO flush upon reconnect with zero silent loss
 */

process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InteractionSurfaceService,
  computeSurfaceActionIdempotencyKey,
  ISurfaceActionEnvelope,
  TemporalOccurrence,
  SurfaceOfflineQueue,
  InMemorySurfaceStorageAdapter,
  IKernelExecutionResult,
} from '../index';
import { KernelCapabilityService, ActionProposal } from '../orchestration/kernel/KernelCapabilityService';
import { registerDefaultActionAdapters } from '../orchestration/kernel/DefaultActionAdapters';

registerDefaultActionAdapters();

test('Phase 13: Complete Product Loop: DUE -> PROPOSAL -> START -> ACTIVE -> DONE -> SILENCE', async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();
  const userId = 'usr_loop_e2e';
  const now = new Date('2026-10-04T10:00:00.000Z').getTime();

  // 1. DUE: Occurrence scheduled right now
  const occ: TemporalOccurrence = {
    occurrenceId: 'occ_e2e_loop',
    userId,
    title: 'Architecture Review',
    kind: 'WORK_SESSION',
    dateOnly: '2026-10-04',
    plannedInterval: {
      dateOnly: '2026-10-04',
      startMinute: 600,
      endMinute: 645,
      durationMinutes: 45,
      startIsoUtc: '2026-10-04T10:00:00.000Z',
      endIsoUtc: '2026-10-04T10:45:00.000Z',
      timezone: 'UTC',
      isMidnightCrossing: false,
    },
    locationContext: { category: 'WORK_SITE' },
    rigidity: 'ELASTIC',
    status: 'SCHEDULED',
    version: 1,
    overrideType: 'NONE',
    createdAt: now,
    updatedAt: now,
  };

  // Projection 1: Proposal pending
  const p1 = await service.computeSurfaceProjection(userId, { referenceTimeMs: now, occurrences: [occ] });
  assert.equal(p1.interactionMode, 'ATTENTION');
  assert.equal(p1.activeExecution?.status, 'PROPOSAL_PENDING');
  assert.equal(p1.activeExecution?.title, 'Architecture Review');

  // 2. User taps [Start]
  const startKey = computeSurfaceActionIdempotencyKey(userId, 'start_execution', occ.occurrenceId, occ.occurrenceId);
  const startProposal: ActionProposal = {
    id: 'prop_start_1',
    domain: 'productivity',
    actionType: 'start_execution',
    targetEntityId: occ.occurrenceId,
    payload: { startedAtMs: now },
    rationale: 'User tapped start on ambient notification',
    reversibility: 'atomic_single_doc',
    idempotencyKey: startKey,
  };

  const kernel = KernelCapabilityService.getInstance();
  const startResult = await kernel.executeAction(userId, startProposal);
  assert.equal(startResult.success, true);

  // 3. ACTIVE: Status transitions to IN_PROGRESS
  occ.status = 'IN_PROGRESS';
  occ.version = 2;
  const p2 = await service.computeSurfaceProjection(userId, { referenceTimeMs: now + 5000, occurrences: [occ] });
  assert.equal(p2.interactionMode, 'ACTIVE_EXECUTION');
  assert.equal(p2.activeExecution?.status, 'ACTIVE');
  assert.equal(p2.activeExecution?.canComplete, true);

  // 4. User taps [Done]
  const doneKey = computeSurfaceActionIdempotencyKey(userId, 'complete_task', occ.occurrenceId, occ.occurrenceId);
  const doneProposal: ActionProposal = {
    id: 'prop_done_1',
    domain: 'productivity',
    actionType: 'complete_task',
    targetEntityId: occ.occurrenceId,
    payload: { completedAtMs: now + 600000 },
    rationale: 'User tapped done on active chronometer notification',
    reversibility: 'atomic_single_doc',
    idempotencyKey: doneKey,
  };

  const doneResult = await kernel.executeAction(userId, doneProposal);
  assert.equal(doneResult.success, true);

  // 5. SILENCE: Occurrence is COMPLETED -> projection returns to SILENT
  occ.status = 'COMPLETED';
  occ.version = 3;
  const p3 = await service.computeSurfaceProjection(userId, { referenceTimeMs: now + 601000, occurrences: [occ] });
  assert.equal(p3.interactionMode, 'SILENT');
  assert.equal(p3.activeExecution, null);
});

test('Phase 13: Adversarial Multi-Device Concurrency: Phone + Desktop + Web tap [Done] simultaneously', async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = 'usr_multi_device';
  const taskId = 'task_concurrent_e2e';

  // Three devices observing different cached projection versions (v3, v4, v5)
  const phoneKey = computeSurfaceActionIdempotencyKey(userId, 'complete_task', taskId, taskId);
  const desktopKey = computeSurfaceActionIdempotencyKey(userId, 'complete_task', taskId, taskId);
  const webKey = computeSurfaceActionIdempotencyKey(userId, 'complete_task', taskId, taskId);

  // Invariant: Logical action identity matches across all 3 devices
  assert.equal(phoneKey, desktopKey);
  assert.equal(desktopKey, webKey);

  const phoneProposal: ActionProposal = {
    id: 'prop_phone',
    domain: 'productivity',
    actionType: 'complete_task',
    targetEntityId: taskId,
    payload: { taskId },
    rationale: 'Phone tap',
    reversibility: 'atomic_single_doc',
    idempotencyKey: phoneKey,
  };

  const desktopProposal: ActionProposal = {
    id: 'prop_desktop',
    domain: 'productivity',
    actionType: 'complete_task',
    targetEntityId: taskId,
    payload: { taskId },
    rationale: 'Desktop tray click',
    reversibility: 'atomic_single_doc',
    idempotencyKey: desktopKey,
  };

  const webProposal: ActionProposal = {
    id: 'prop_web',
    domain: 'productivity',
    actionType: 'complete_task',
    targetEntityId: taskId,
    payload: { taskId },
    rationale: 'Web banner click',
    reversibility: 'atomic_single_doc',
    idempotencyKey: webKey,
  };

  // Fire all 3 concurrently
  const [phoneRes, desktopRes, webRes] = await Promise.all([
    kernel.executeAction(userId, phoneProposal),
    kernel.executeAction(userId, desktopProposal),
    kernel.executeAction(userId, webProposal),
  ]);

  // All 3 succeed cleanly
  assert.equal(phoneRes.success, true);
  assert.equal(desktopRes.success, true);
  assert.equal(webRes.success, true);

  // Exactly one execution is authoritative commit, the others are idempotent repeats
  const idempotentReplies = [phoneRes, desktopRes, webRes].filter(r => r.idempotent === true);
  const nonIdempotentCommits = [phoneRes, desktopRes, webRes].filter(r => !r.idempotent);

  assert.equal(nonIdempotentCommits.length, 1, 'Exactly one state-changing mutation committed');
  assert.equal(idempotentReplies.length, 2, 'Exactly two idempotent cached replies returned');
});

test('Phase 13: Offline Queue Replay: Deterministic FIFO flush upon reconnect', async () => {
  const storage = new InMemorySurfaceStorageAdapter();
  const queue = new SurfaceOfflineQueue(storage);
  await queue.initialize();

  const userId = 'usr_offline_replay';
  const actions: ISurfaceActionEnvelope<'complete_task'>[] = [
    {
      sourceSurface: 'ANDROID_NOTIFICATION',
      actionType: 'complete_task',
      entityId: 'task_1',
      timestampMs: Date.now(),
      idempotencyKey: computeSurfaceActionIdempotencyKey(userId, 'complete_task', 'task_1', 'seed_1'),
      observedProjectionVersion: 1,
      payload: { completedAtMs: Date.now() },
      clientSessionToken: 'token_abc',
    },
    {
      sourceSurface: 'ANDROID_NOTIFICATION',
      actionType: 'complete_task',
      entityId: 'task_2',
      timestampMs: Date.now(),
      idempotencyKey: computeSurfaceActionIdempotencyKey(userId, 'complete_task', 'task_2', 'seed_2'),
      observedProjectionVersion: 1,
      payload: { completedAtMs: Date.now() },
      clientSessionToken: 'token_abc',
    },
  ];

  for (const act of actions) {
    await queue.enqueue(act);
  }

  assert.equal(queue.getPendingCount(), 2);

  // Set dispatch handler that executes via KernelCapabilityService
  const kernel = KernelCapabilityService.getInstance();
  const executedOrder: string[] = [];

  queue.setDispatchHandler(async (env) => {
    executedOrder.push(env.entityId);
    const proposal: ActionProposal = {
      id: `prop_${env.entityId}`,
      domain: 'productivity',
      actionType: env.actionType,
      targetEntityId: env.entityId,
      payload: env.payload,
      rationale: 'Offline queue flush execution',
      reversibility: 'atomic_single_doc',
      idempotencyKey: env.idempotencyKey,
    };
    const kernelResult = await kernel.executeAction(userId, proposal);
    const result: IKernelExecutionResult = {
      outcome: 'EXECUTE_COMMITTED',
      actionId: kernelResult.actionId,
      idempotencyKey: kernelResult.idempotencyKey,
      committedAtMs: Date.now(),
    };
    return result;
  });

  const flushResult = await queue.flush();

  assert.equal(flushResult.committed, 2, 'Both queued offline actions committed');
  assert.equal(flushResult.failed, 0, 'Zero failed items');
  assert.equal(flushResult.conflicted, 0, 'Zero conflicted items');
  assert.equal(queue.getPendingCount(), 0, 'Queue completely drained');
  assert.deepEqual(executedOrder, ['task_1', 'task_2'], 'FIFO deterministic replay order');
});
