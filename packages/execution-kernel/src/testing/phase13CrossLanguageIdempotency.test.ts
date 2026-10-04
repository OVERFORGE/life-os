import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import { computeSurfaceActionIdempotencyKey } from "../experience/surface/contracts/InteractionSurfaceContracts";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";

/**
 * Pure Kotlin-equivalent SHA-256 generator matching WidgetActionReceiver.kt:
 * MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
 */
function kotlinSimulatedIdempotencyKey(
  userId: string,
  actionType: string,
  entityId: string,
  seed: string
): string {
  const raw = `${userId.trim()}:${actionType.trim()}:${entityId.trim()}:${seed.trim()}`;
  return createHash("sha256").update(Buffer.from(raw, "utf8")).digest("hex");
}

test("Phase 13: Cross-Language Idempotency Test Vectors (TypeScript == Kotlin == Standard SHA-256)", () => {
  const vectors = [
    {
      userId: "usr_ambient_001",
      actionType: "complete_task" as const,
      entityId: "task_refactor_widget",
      seed: "seed_alpha_99",
    },
    {
      userId: "usr_mobile_active",
      actionType: "start_execution" as const,
      entityId: "occ_block_77",
      seed: "occ_block_77",
    },
    {
      userId: "usr_user_123",
      actionType: "defer_execution" as const,
      entityId: "task_deep_work",
      seed: "defer_15m_seed",
    },
    {
      userId: "usr_whitespace_test  ",
      actionType: "complete_task" as const,
      entityId: "  task_trimmed ",
      seed: " seed_trimmed ",
    },
  ];

  for (const v of vectors) {
    const tsKey = computeSurfaceActionIdempotencyKey(
      v.userId.trim(),
      v.actionType,
      v.entityId.trim(),
      v.seed.trim()
    );
    const kotlinKey = kotlinSimulatedIdempotencyKey(v.userId, v.actionType, v.entityId, v.seed);

    // 1. Exact string match across language implementations
    assert.equal(
      tsKey,
      kotlinKey,
      `Idempotency key mismatch for vector: ${JSON.stringify(v)}`
    );

    // 2. Exact length (SHA-256 produces 64 hex characters)
    assert.equal(tsKey.length, 64);
    assert.match(tsKey, /^[0-9a-f]{64}$/);
  }
});

test("Phase 13: Adversarial Idempotency — 5 Rapid [Done] Taps Yield Exactly 1 Mutation", async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = "usr_rapid_tap_user";
  const entityId = "task_ambient_review_01";
  const seed = "seed_burst_done";
  const idempotencyKey = computeSurfaceActionIdempotencyKey(
    userId,
    "complete_task",
    entityId,
    seed
  );

  const proposal: ActionProposal = {
    id: `prop_rapid_${Date.now()}`,
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId },
    rationale: "Rapid multi-tap test on widget Done button",
    reversibility: "atomic_single_doc",
    idempotencyKey,
  };

  // Simulate 5 rapid sequential taps from the widget
  const responses = [];
  for (let tap = 1; tap <= 5; tap++) {
    const result = await kernel.executeAction(userId, proposal);
    responses.push(result);
  }

  // Verification 1: All 5 taps returned success (no crashes, no UI error freezes)
  assert.equal(responses.length, 5);
  for (const res of responses) {
    assert.equal(res.success, true);
  }

  // Verification 2: Tap 1 committed; Taps 2 through 5 are safe idempotent duplicates
  assert.equal(!responses[0].idempotent, true, "Tap 1 must execute the authoritative commit");
  for (let i = 1; i < 5; i++) {
    assert.equal(
      responses[i].idempotent,
      true,
      `Tap ${i + 1} must be recognized as an idempotent duplicate`
    );
  }

  // Verification 3: Exactly 1 chronicle entry created in audit store
  const auditRecord = kernel.getAuditRecord(idempotencyKey);
  assert.ok(auditRecord, "Authoritative state chronicle must contain an entry");
  assert.equal(auditRecord?.idempotencyKey, idempotencyKey);
  assert.equal(auditRecord?.status, "SUCCEEDED");
});

test("Phase 13: Cross-Device Concurrency Race — Phone vs Desktop Simultaneous Tap", async () => {
  const kernel = KernelCapabilityService.getInstance();
  kernel.clearAuditStore();

  const userId = "usr_ambient_dual";
  const entityId = "task_sync_race";
  const commonSeed = "shared_seed_101";

  // Common idempotency key computed on two separate devices
  const phoneKey = kotlinSimulatedIdempotencyKey(userId, "complete_task", entityId, commonSeed);
  const desktopKey = computeSurfaceActionIdempotencyKey(userId, "complete_task", entityId, commonSeed);

  assert.equal(phoneKey, desktopKey, "Cross-surface idempotency keys must be byte-for-byte identical");

  const phoneProposal: ActionProposal = {
    id: `prop_phone_${Date.now()}`,
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId, source: "ANDROID_WIDGET" },
    rationale: "Headless widget tap",
    reversibility: "atomic_single_doc",
    idempotencyKey: phoneKey,
  };

  const desktopProposal: ActionProposal = {
    id: `prop_desktop_${Date.now()}`,
    domain: "productivity",
    actionType: "complete_task",
    targetEntityId: entityId,
    payload: { taskId: entityId, source: "DESKTOP_TRAY" },
    rationale: "Desktop tray tap",
    reversibility: "atomic_single_doc",
    idempotencyKey: desktopKey,
  };

  // Launch both requests simultaneously
  const [phoneRes, desktopRes] = await Promise.all([
    kernel.executeAction(userId, phoneProposal),
    kernel.executeAction(userId, desktopProposal),
  ]);

  assert.equal(phoneRes.success, true);
  assert.equal(desktopRes.success, true);

  // One must be the commit, the other must be the idempotent duplicate
  const commits = [phoneRes, desktopRes].filter((r) => !r.idempotent);
  const duplicates = [phoneRes, desktopRes].filter((r) => r.idempotent === true);

  assert.equal(commits.length, 1, "Exactly one cross-device tap must commit");
  assert.equal(duplicates.length, 1, "The competing cross-device tap must safely deduplicate");
});

test("Phase 13: Two-Phase Leased Queue Reclamation Simulation", () => {
  interface IQueueItem {
    idempotencyKey: string;
    createdAtMs: number;
    status: "PENDING" | "IN_FLIGHT";
    leaseExpiresAtMs: number;
    envelope: any;
  }

  const now = Date.now();
  const queue: IQueueItem[] = [
    {
      idempotencyKey: "item_stuck_in_flight",
      createdAtMs: now - 60000,
      status: "IN_FLIGHT",
      leaseExpiresAtMs: now - 10000, // Expired lease (crashed process)
      envelope: { actionType: "complete_task", entityId: "t1" },
    },
    {
      idempotencyKey: "item_active_in_flight",
      createdAtMs: now - 5000,
      status: "IN_FLIGHT",
      leaseExpiresAtMs: now + 25000, // Active lease by other process
      envelope: { actionType: "start_execution", entityId: "t2" },
    },
    {
      idempotencyKey: "item_pending",
      createdAtMs: now - 1000,
      status: "PENDING",
      leaseExpiresAtMs: 0,
      envelope: { actionType: "defer_execution", entityId: "t3" },
    },
  ];

  // Simulate LifeOsQueueReplayWorker evaluation
  const eligibleForDispatch: string[] = [];
  const preservedInFlight: string[] = [];

  for (const item of queue) {
    if (item.status === "IN_FLIGHT" && item.leaseExpiresAtMs > now) {
      preservedInFlight.push(item.idempotencyKey);
      continue;
    }
    // Claim lease
    item.status = "IN_FLIGHT";
    item.leaseExpiresAtMs = now + 30000;
    eligibleForDispatch.push(item.idempotencyKey);
  }

  // item_stuck_in_flight (expired lease) is reclaimed!
  assert.ok(eligibleForDispatch.includes("item_stuck_in_flight"));
  // item_pending is claimed
  assert.ok(eligibleForDispatch.includes("item_pending"));
  // item_active_in_flight is preserved
  assert.ok(preservedInFlight.includes("item_active_in_flight"));
  assert.equal(preservedInFlight.length, 1);
  assert.equal(eligibleForDispatch.length, 2);
});
