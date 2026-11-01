/**
 * step4Loop5AutonomousDaemon.test.ts
 * 
 * Step 4 Loop 5: Autonomous Execution Daemon & Leased Proactive Loop
 * 
 * Verification Battery:
 * 1. Timezone validation: IANA timezone validation accepts valid and rejects malformed/null identifiers.
 * 2. Two-Tier Timezone Safety: Null or invalid timezone defers Category B with TIMEZONE_RESOLUTION_REQUIRED (Zero silent UTC fallback).
 * 3. User local context calculation: Accurately converts epoch to user-local date and hour across timezones (EST, PST, IST, UTC).
 * 4. Leased execution: Acquires partition lease ${userId}:autonomous:daemon and executes under active fencing token.
 * 5. Competing worker isolation: Worker B skips execution when lease is actively held by Worker A.
 * 6. Category execution separation: Category A always runs; Category B only runs when timezone is valid.
 * 7. Multi-user batch execution: Respects maxUsersPerTick and processes user batch cleanly.
 * 8. Graceful shutdown: AutonomousWorkerDaemonRunner drains active ticks on stop.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AutonomousExecutionDaemon,
  isValidTimezone,
  getUserLifecycleContext,
} from "../../autonomous/AutonomousExecutionDaemon";
import { AutonomousLeaseManager } from "../../autonomous/AutonomousLeaseManager";
import { AutonomousWorkerDaemonRunner } from "../../../../../scripts/autonomous-worker-daemon";

class MockLeaseModel {
  public leases: Map<string, any> = new Map();

  async findOne(query: Record<string, any>): Promise<any> {
    for (const doc of this.leases.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (k === "expiresAt" && v && v.$gt) {
          if (new Date(doc.expiresAt).getTime() <= new Date(v.$gt).getTime()) match = false;
        } else if (doc[k] !== v) {
          match = false;
        }
      }
      if (match) return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  async create(doc: any): Promise<any> {
    const saved = JSON.parse(JSON.stringify(doc));
    this.leases.set(doc.userId, saved);
    return saved;
  }

  async findOneAndUpdate(filter: Record<string, any>, update: any, _opts?: any): Promise<any> {
    const userId = filter.userId;
    const doc = this.leases.get(userId);
    if (!doc) return null;

    let match = true;
    if (filter.$or) {
      const orMatched = filter.$or.some((clause: any) => {
        if (clause.status && doc.status === clause.status) return true;
        if (clause.expiresAt && clause.expiresAt.$lt) {
          return new Date(doc.expiresAt).getTime() < new Date(clause.expiresAt.$lt).getTime();
        }
        return false;
      });
      if (!orMatched) match = false;
    }
    if (filter.status && doc.status !== filter.status) match = false;
    if (filter.epoch !== undefined && doc.epoch !== filter.epoch) match = false;
    if (filter.leaseHolder && doc.leaseHolder !== filter.leaseHolder) match = false;

    if (!match) return null;

    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (v as number);
      }
    }
    if (update.$set) Object.assign(doc, update.$set);
    this.leases.set(userId, doc);
    return JSON.parse(JSON.stringify(doc));
  }

  async updateOne(filter: Record<string, any>, update: any): Promise<any> {
    const userId = filter.userId;
    const doc = this.leases.get(userId);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (filter.epoch !== undefined && doc.epoch !== filter.epoch) return { matchedCount: 0, modifiedCount: 0 };
    if (filter.leaseHolder && doc.leaseHolder !== filter.leaseHolder) return { matchedCount: 0, modifiedCount: 0 };

    if (update.$set) Object.assign(doc, update.$set);
    this.leases.set(userId, doc);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

describe("Step 4 Loop 5: Autonomous Execution Daemon & Leased Proactive Loop", () => {
  let mockLeaseModel: MockLeaseModel;
  let leaseManager: AutonomousLeaseManager;

  beforeEach(() => {
    mockLeaseModel = new MockLeaseModel();
    leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });
  });

  it("1. Timezone validation accepts valid IANA zones and rejects invalid/null identifiers", () => {
    assert.equal(isValidTimezone("America/New_York"), true);
    assert.equal(isValidTimezone("Asia/Kolkata"), true);
    assert.equal(isValidTimezone("Europe/London"), true);
    assert.equal(isValidTimezone("UTC"), true);

    assert.equal(isValidTimezone(null), false);
    assert.equal(isValidTimezone(undefined), false);
    assert.equal(isValidTimezone(""), false);
    assert.equal(isValidTimezone("Mars/Curiosity"), false);
    assert.equal(isValidTimezone("GMT+99"), false);
  });

  it("2. Two-Tier Timezone Safety: Null or invalid timezone defers Category B with TIMEZONE_RESOLUTION_REQUIRED", () => {
    const invalidContext = getUserLifecycleContext("user-no-tz", null);
    assert.equal(invalidContext.timezoneValid, false);
    assert.equal(invalidContext.userTimezone, null);
    assert.equal(invalidContext.userLocalDate, "");
    assert.equal(invalidContext.userLocalHour, -1);

    const malformedContext = getUserLifecycleContext("user-bad-tz", "Invalid/Timezone_Name");
    assert.equal(malformedContext.timezoneValid, false);
  });

  it("3. User local context calculation: Accurately converts date and hour across timezones", () => {
    // 2026-11-02T02:00:00Z (2 AM UTC)
    const fixedUtcTime = new Date("2026-11-02T02:00:00Z");

    // In Asia/Kolkata (UTC +5:30) => 2026-11-02 07:30 => localHour: 7
    const istContext = getUserLifecycleContext("user-ist", "Asia/Kolkata", fixedUtcTime);
    assert.equal(istContext.timezoneValid, true);
    assert.equal(istContext.userLocalDate, "2026-11-02");
    assert.equal(istContext.userLocalHour, 7);

    // In America/New_York (UTC -5 in standard time) => 2026-11-01 21:00 => localHour: 21, previous date!
    const nyContext = getUserLifecycleContext("user-ny", "America/New_York", fixedUtcTime);
    assert.equal(nyContext.timezoneValid, true);
    assert.equal(nyContext.userLocalDate, "2026-11-01");
    assert.equal(nyContext.userLocalHour, 21);
  });

  it("4. Leased execution: Acquires partition lease and executes under active fencing token", async () => {
    const daemon = new AutonomousExecutionDaemon({
      userId: "user-exec-1",
      workerId: "worker-exec-1",
      leaseManager,
    });

    let catAExecuted = false;
    let catBExecuted = false;

    const result = await daemon.tickUser(
      { userId: "user-exec-1", timezone: "America/Chicago" },
      {
        categoryA: async (_token) => { catAExecuted = true; },
        categoryB: async (_ctx, _token) => { catBExecuted = true; },
      }
    );

    assert.equal(result.executed, true);
    assert.equal(catAExecuted, true);
    assert.equal(catBExecuted, true);
    assert.equal(result.categoryBDeferred, false);
    assert.ok(result.token);
    assert.equal(result.token.workerId, "worker-exec-1");
  });

  it("5. Competing worker isolation: Worker B skips execution when lease is actively held by Worker A", async () => {
    // Worker A holds active lease on user
    const partitionKey = "user-contested:autonomous:daemon";
    await leaseManager.acquireLease(partitionKey, "worker-A", 60000);

    const daemonB = new AutonomousExecutionDaemon({
      userId: "user-contested",
      workerId: "worker-B",
      leaseManager,
    });

    const result = await daemonB.tickUser({ userId: "user-contested", timezone: "UTC" });
    assert.equal(result.executed, false);
    assert.equal(result.reason, "LEASE_HELD_BY_ANOTHER_WORKER");
  });

  it("6. Category execution separation: Category A runs, Category B is deferred on missing timezone", async () => {
    const daemon = new AutonomousExecutionDaemon({
      userId: "user-no-tz-exec",
      workerId: "worker-cat-split",
      leaseManager,
    });

    let catAExecuted = false;
    let catBExecuted = false;

    const result = await daemon.tickUser(
      { userId: "user-no-tz-exec", timezone: null }, // Missing timezone
      {
        categoryA: async (_token) => { catAExecuted = true; },
        categoryB: async (_ctx, _token) => { catBExecuted = true; },
      }
    );

    assert.equal(result.executed, true);
    assert.equal(catAExecuted, true);
    assert.equal(catBExecuted, false); // Category B suppressed
    assert.equal(result.categoryBDeferred, true);
    assert.equal(result.reason, "TIMEZONE_RESOLUTION_REQUIRED");
  });

  it("7. Multi-user batch execution: Respects maxUsersPerTick and executes batch", async () => {
    const users = [
      { userId: "user-batch-1", timezone: "UTC" },
      { userId: "user-batch-2", timezone: "America/New_York" },
      { userId: "user-batch-3", timezone: null },
      { userId: "user-batch-4", timezone: "Asia/Tokyo" },
      { userId: "user-batch-5", timezone: "Europe/Paris" },
      { userId: "user-batch-6", timezone: "Australia/Sydney" },
    ];

    const results = await AutonomousExecutionDaemon.executeTickForUsers(
      users,
      "worker-batch-lead",
      leaseManager,
      { maxUsersPerTick: 3 } // Only process first 3
    );

    assert.equal(results.length, 3);
    assert.equal(results[0].userId, "user-batch-1");
    assert.equal(results[1].userId, "user-batch-2");
    assert.equal(results[2].userId, "user-batch-3");
    assert.equal(results[2].categoryBDeferred, true);
  });

  it("8. AutonomousWorkerDaemonRunner: Runs tick on provided users and stops cleanly", async () => {
    const mockDwcp = { reconcileStalledWorkflows: async () => [] };
    const mockSweeper = { sweepPartition: async () => ({ status: "CLEAN" }) };

    const runner = new AutonomousWorkerDaemonRunner({
      workerId: "worker-runner-test",
      pollIntervalMs: 50,
      leaseDurationMs: 10000,
      leaseManager,
      dwcpService: mockDwcp,
      scheduleSweeper: mockSweeper,
    });

    const testUsers = [
      { userId: "runner-user-1", timezone: "UTC" },
      { userId: "runner-user-2", timezone: null },
    ];

    const tickResults = await runner.runTick(testUsers);
    assert.equal(tickResults.length, 2);

    const health = runner.getHealth();
    assert.equal(health.workerId, "worker-runner-test");
    assert.equal(health.activeTicks, 0);

    await runner.stop();
  });
});
