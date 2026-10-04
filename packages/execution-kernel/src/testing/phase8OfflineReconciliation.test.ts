import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SurfaceOfflineQueue,
  InMemorySurfaceStorageAdapter,
  ISurfaceActionEnvelope,
  IKernelExecutionResult,
  computeSurfaceActionIdempotencyKey,
} from "../index";

test("Phase 8: Truthful Offline Queueing: Actions remain PENDING_OFFLINE and never fake success", async () => {
  const storage = new InMemorySurfaceStorageAdapter();
  const queue = new SurfaceOfflineQueue(storage);
  await queue.initialize();

  const userId = "usr_offline_test";
  const entityId = "task_offline_1";
  const key = computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, "seed_1");

  const envelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "ANDROID_NOTIFICATION",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey: key,
    observedProjectionVersion: 1,
    payload: { completedAtMs: Date.now() },
    clientSessionToken: "token_abc",
  };

  const queuedItem = await queue.enqueue(envelope);

  // Invariant 7: Truthful offline behavior — visibly provisional
  assert.equal(queuedItem.status, "PENDING_OFFLINE");
  assert.equal(queue.getPendingCount(), 1);

  // Simulate app restart / reboot: verify durability in storage
  const restoredQueue = new SurfaceOfflineQueue(storage);
  await restoredQueue.initialize();

  assert.equal(restoredQueue.getPendingCount(), 1);
  assert.equal(restoredQueue.getItems()[0].envelope.idempotencyKey, key);
  assert.equal(restoredQueue.getItems()[0].status, "PENDING_OFFLINE");
});

test("Phase 8: FIFO Replay on reconnect: 5 queued actions execute in deterministic order with exact keys", async () => {
  const storage = new InMemorySurfaceStorageAdapter();
  const queue = new SurfaceOfflineQueue(storage);
  await queue.initialize();

  const userId = "usr_fifo_test";
  const executedOrder: string[] = [];

  // Enqueue 5 sequential actions
  for (let i = 1; i <= 5; i++) {
    const entityId = `task_seq_${i}`;
    const envelope: ISurfaceActionEnvelope<"complete_task"> = {
      sourceSurface: "ANDROID_NOTIFICATION",
      actionType: "complete_task",
      entityId,
      timestampMs: Date.now() + i * 100,
      idempotencyKey: computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, `seed_${i}`),
      observedProjectionVersion: 1,
      payload: { completedAtMs: Date.now() },
      clientSessionToken: "token_abc",
    };
    await queue.enqueue(envelope);
  }

  assert.equal(queue.getPendingCount(), 5);

  // Mock server dispatch handler
  queue.setDispatchHandler(async (env) => {
    executedOrder.push(env.entityId);
    const result: IKernelExecutionResult = {
      outcome: "EXECUTE_COMMITTED",
      actionId: `act_${env.entityId}`,
      idempotencyKey: env.idempotencyKey,
      committedAtMs: Date.now(),
    };
    return result;
  });

  const flushResult = await queue.flush();

  assert.equal(flushResult.committed, 5);
  assert.equal(flushResult.conflicted, 0);
  assert.equal(flushResult.failed, 0);
  assert.equal(queue.getPendingCount(), 0);

  // Invariant: Deterministic FIFO order preserved
  assert.deepEqual(executedOrder, [
    "task_seq_1",
    "task_seq_2",
    "task_seq_3",
    "task_seq_4",
    "task_seq_5",
  ]);
});

test("Phase 8: Conflict Handling: RECONCILIATION_REQUIRED marks item as CONFLICT_NEEDS_ATTENTION", async () => {
  const storage = new InMemorySurfaceStorageAdapter();
  const queue = new SurfaceOfflineQueue(storage);
  await queue.initialize();

  const userId = "usr_conflict_test";
  const entityId = "task_conflict_stale";

  const envelope: ISurfaceActionEnvelope<"defer_execution"> = {
    sourceSurface: "WEB_STICKY_BAR",
    actionType: "defer_execution",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey: computeSurfaceActionIdempotencyKey(userId, "defer_execution", entityId, "seed_c"),
    observedProjectionVersion: 1,
    payload: { deferMinutes: 15 },
    clientSessionToken: "token_abc",
  };

  await queue.enqueue(envelope);

  // Server indicates entity was modified elsewhere and cannot be automatically reconciled
  queue.setDispatchHandler(async (env) => {
    const conflictResult: IKernelExecutionResult = {
      outcome: "RECONCILIATION_REQUIRED",
      actionId: "act_conflict",
      idempotencyKey: env.idempotencyKey,
      errorMessage: "Task state changed on another device. Please review.",
    };
    return conflictResult;
  });

  const flushResult = await queue.flush();

  assert.equal(flushResult.committed, 0);
  assert.equal(flushResult.conflicted, 1);

  // Invariant 7: Never fake success. The item is flagged honestly as requiring user attention
  const items = queue.getItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "CONFLICT_NEEDS_ATTENTION");
  assert.equal(items[0].errorMessage, "Task state changed on another device. Please review.");
});
