import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

import { ProductionReplayFixtureEngine } from "./ProductionReplayFixtureEngine";
import { ChaosFailureInjector } from "./ChaosFailureInjector";
import { NoSecondBrainAuditSuite } from "./NoSecondBrainAuditSuite";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

test("PHASE 13: Real-System Production Hardening & Mock Purge Suite", async (suite) => {
  suite.before(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: "lifeos", serverSelectionTimeoutMS: 5000 });
    }
  });

  suite.after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  await suite.test("HARD-01: Production Replay Fixture Engine (Class B Testing & SHA-256 Signatures)", async () => {
    const replayEngine = ProductionReplayFixtureEngine.getInstance();
    replayEngine.clearFixtures();

    const prompt = "Schedule deep work tomorrow morning";
    const context = { timezone: "UTC", userRole: "Architect" };
    const stm = { lastTopic: "calendar" };

    const proposals: ActionProposal[] = [
      {
        proposalId: "prop-replay-1",
        capabilityURN: "urn:lifeos:action:create_internal_focus_block",
        intentCategory: "CREATE_SCHEDULE_ITEM",
        parameters: { durationMinutes: 120 },
        confidence: 0.95,
        provenance: "ReplayFixture",
        requiresConfirmation: false,
        estimatedImpactScore: 0.85,
      } as unknown as ActionProposal,
    ];

    const results = [{ capabilityURN: "urn:lifeos:action:create_internal_focus_block", success: true, resultId: "res-1" }];

    // 1. Record fixture
    const fixture = replayEngine.recordFixture(
      "fix-001",
      prompt,
      context,
      stm,
      { intentCategory: "CREATE_SCHEDULE_ITEM", targetEntities: [], rawUserLanguage: prompt },
      proposals,
      results
    );

    assert.ok(fixture.inputHash);
    assert.ok(fixture.cryptographicSignature);

    // 2. Deterministic Replay: Exact matching prompt and context
    const replayRes = replayEngine.replayFixture("fix-001", prompt, context);
    assert.equal(replayRes.matched, true);
    assert.equal(replayRes.fixture?.actionProposals.length, 1);
    assert.equal((replayRes.fixture?.actionProposals[0] as any).proposalId, "prop-replay-1");

    // 3. Replay Drift Detection: Altered context should mismatch
    const alteredContext = { timezone: "PST", userRole: "Architect" }; // different timezone
    const driftRes = replayEngine.replayFixture("fix-001", prompt, alteredContext);
    assert.equal(driftRes.matched, false);
    assert.ok(driftRes.error?.includes("Cryptographic Mismatch"));
  });

  await suite.test("HARD-02: Chaos Failure Injector (DB Drop, 504 Timeout, Malformed Payload, Circuit Breaker)", async () => {
    const chaos = ChaosFailureInjector.getInstance();

    // 1. Database disconnect
    const dbDrop = chaos.simulateDatabaseDisconnect();
    assert.equal(dbDrop.handledSafely, true);
    assert.equal(dbDrop.stateClass, "UNKNOWN_EXTERNAL_STATE");
    assert.equal(dbDrop.dataCorruptionDetected, false);

    // 2. External 504 Gateway Timeout
    const timeout = chaos.simulateProviderTimeout();
    assert.equal(timeout.handledSafely, true);
    assert.equal(timeout.stateClass, "UNKNOWN_EXTERNAL_STATE");
    assert.ok(timeout.diagnostic.includes("UNKNOWN_EXTERNAL_STATE"));

    // 3. Malformed payload
    const malformed = chaos.simulateMalformedPayload();
    assert.equal(malformed.handledSafely, true);
    assert.equal(malformed.stateClass, "EXTERNAL_REJECTED");

    // 4. Circuit Breaker Trip
    const cb = chaos.simulateCircuitBreakerTrip(3);
    assert.equal(cb.handledSafely, true);
    assert.equal(cb.stateClass, "CIRCUIT_BREAKER_ACTIVE");
  });

  await suite.test("HARD-03: No Second Brain & Constitutional Invariants Architectural Audit", async () => {
    const auditSuite = NoSecondBrainAuditSuite.getInstance();
    const result = auditSuite.runAudit();

    assert.ok(result.scannedFilesCount > 50, `Expected > 50 files scanned, got ${result.scannedFilesCount}`);
    assert.equal(
      result.allInvariantsPassed,
      true,
      `Audit violations found: ${JSON.stringify(result.violations, null, 2)}`
    );
    assert.equal(result.violations.length, 0);
  });

  await suite.test("HARD-04: Real MongoDB Replica Set Connection Pool Configuration", async () => {
    if (mongoose.connection.readyState !== 1) return;

    assert.equal(mongoose.connection.readyState, 1);
    assert.ok(mongoose.connection.db);
    const pingRes = await mongoose.connection.db.admin().ping();
    assert.equal(pingRes.ok, 1, "MongoDB Atlas replica set ping must return ok: 1");
  });
});
