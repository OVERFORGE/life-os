/**
 * loop5ProductionWorker.test.ts
 * 
 * Step 2 Loop 5 Test Battery:
 * - 7 Canonical Consumer registration verification
 * - Mode 1 In-Band Automation Batch execution
 * - Mode 2 Standalone OutboxWorkerDaemon lifecycle & graceful shutdown
 * - Worker health & metrics reporting contracts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createCanonicalConsumerRegistry,
  OutboxWorkerDaemon,
} from "../../events/dispatch/OutboxWorkerService";

describe("Step 2 — Loop 5: Production Worker Activation (Dual-Mode Engine)", () => {
  it("Scenario 1: createCanonicalConsumerRegistry registers all 7 canonical consumers", () => {
    const registry = createCanonicalConsumerRegistry();

    const expectedConsumers = [
      "GoalIntelligenceConsumer",
      "ExecutionGraphConsumer",
      "TemporalConflictConsumer",
      "PhysicalReadinessConsumer",
      "CadenceLearningConsumer",
      "BehavioralIntelligenceConsumer",
      "CognitiveHistoryConsumer",
    ];

    for (const name of expectedConsumers) {
      assert.ok(
        (registry as any).consumers.has(name),
        `Consumer '${name}' must be registered in the canonical registry`
      );
    }
  });

  it("Scenario 2: OutboxWorkerDaemon lifecycle: start, report health, advance metrics, and graceful stop", async () => {
    let cyclesExecuted = 0;
    const mockDispatcher: any = {
      getWorkerId: () => "dispatcher_mock_1",
      executeCycle: async () => {
        cyclesExecuted++;
        return {
          leasedCount: 1,
          succeededCount: 1,
          failedCount: 0,
          fencedCount: 0,
          deadLetterCount: 0,
        };
      },
    };

    const daemon = new OutboxWorkerDaemon({
      pollIntervalMs: 20,
      dispatcher: mockDispatcher,
    });

    const initialHealth = daemon.getHealth();
    assert.equal(initialHealth.isHealthy, false, "Daemon should not be healthy prior to start");
    assert.equal(initialHealth.uptimeSeconds, 0);
    assert.equal(initialHealth.workerId, "dispatcher_mock_1");

    // Start daemon in background
    const runPromise = daemon.start();

    // Allow daemon to tick
    await new Promise((r) => setTimeout(r, 60));

    const activeHealth = daemon.getHealth();
    assert.equal(activeHealth.isHealthy, true, "Daemon should report healthy while running");
    assert.ok(activeHealth.totalLeased >= 1, "Leased count must advance");
    assert.ok(activeHealth.totalSucceeded >= 1, "Succeeded count must advance");
    assert.ok(activeHealth.lastHeartbeat instanceof Date);

    // Stop daemon gracefully
    daemon.stop();
    await runPromise;

    const stoppedHealth = daemon.getHealth();
    assert.equal(stoppedHealth.isHealthy, false, "Daemon should report not healthy after stop");
  });
});
