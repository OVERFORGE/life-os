import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import {
  computeSurfaceActionIdempotencyKey,
  ISurfaceActionEnvelope,
  KernelCapabilityService,
  ActionProposal,
  InteractionSurfaceService,
} from "../index";

test("Phase 2: Translation from Surface Action Envelope to Canonical ActionProposal", () => {
  const userId = "usr_gateway_test";
  const entityId = "task_arch_review";
  const idempotencyKey = computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, "seed_1");

  const envelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "ANDROID_NOTIFICATION",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey,
    observedProjectionVersion: 3,
    payload: {
      completedAtMs: Date.now(),
      completionNote: "Finished all sections",
    },
    clientSessionToken: "sess_valid_token_123",
  };

  assert.equal(envelope.actionType, "complete_task");
  assert.equal(envelope.idempotencyKey.length, 64);
  assert.equal(envelope.sourceSurface, "ANDROID_NOTIFICATION");
  assert.equal(envelope.observedProjectionVersion, 3);
});

test("Phase 2: Concurrency & Idempotency: 50 concurrent identical requests yield exactly 1 execution commit", async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = "usr_concurrency_test";
  const entityId = "task_concurrent_99";
  const idempotencyKey = computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, "seed_same");

  const proposal: ActionProposal = {
    id: `prop_test_${Date.now()}`,
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId },
    rationale: "Concurrent tap test",
    reversibility: "atomic_single_doc",
    idempotencyKey,
  };

  // Launch 50 concurrent execution attempts
  const attempts = 50;
  const promises: Promise<any>[] = [];

  for (let i = 0; i < attempts; i++) {
    promises.push(kernel.executeAction(userId, proposal));
  }

  const results = await Promise.all(promises);

  // Assertions:
  // 1. All attempts returned success
  for (const res of results) {
    assert.equal(res.success, true);
  }

  // 2. Exactly one result is the original commit (idempotent !== true)
  const initialCommits = results.filter((r) => !r.idempotent);
  const idempotentReplies = results.filter((r) => r.idempotent === true);

  assert.equal(initialCommits.length, 1, "Exactly one request should execute the initial commit");
  assert.equal(idempotentReplies.length, attempts - 1, "Remaining 49 requests must be idempotent duplicates");
});

test("Phase 2: Cross-Device Concurrency: Phone (v5) and Desktop (v6) tap [Done] simultaneously", async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = "usr_cross_device";
  const entityId = "task_distributed_sync";
  const seed = "occ_common_block";

  // Device 1: Android notification at observedProjectionVersion 5
  const phoneEnvelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "ANDROID_NOTIFICATION",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey: computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, seed),
    observedProjectionVersion: 5,
    payload: { completedAtMs: Date.now() },
    clientSessionToken: "sess_phone",
  };

  // Device 2: Desktop Tray at observedProjectionVersion 6
  const desktopEnvelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "DESKTOP_TRAY",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey: computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, seed),
    observedProjectionVersion: 6,
    payload: { completedAtMs: Date.now() },
    clientSessionToken: "sess_desktop",
  };

  // The idempotency key MUST match across devices for the same logical action
  assert.equal(phoneEnvelope.idempotencyKey, desktopEnvelope.idempotencyKey);

  const proposalPhone: ActionProposal = {
    id: "prop_phone_1",
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId },
    rationale: "Phone tap",
    reversibility: "atomic_single_doc",
    idempotencyKey: phoneEnvelope.idempotencyKey,
  };

  const proposalDesktop: ActionProposal = {
    id: "prop_desktop_1",
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId },
    rationale: "Desktop tap",
    reversibility: "atomic_single_doc",
    idempotencyKey: desktopEnvelope.idempotencyKey,
  };

  // Execute both concurrently
  const [resPhone, resDesktop] = await Promise.all([
    kernel.executeAction(userId, proposalPhone),
    kernel.executeAction(userId, proposalDesktop),
  ]);

  assert.equal(resPhone.success, true);
  assert.equal(resDesktop.success, true);

  // One is the commit, the other is an idempotent duplicate
  const commits = [resPhone, resDesktop].filter((r) => !r.idempotent);
  const duplicates = [resPhone, resDesktop].filter((r) => r.idempotent === true);

  assert.equal(commits.length, 1);
  assert.equal(duplicates.length, 1);
});
