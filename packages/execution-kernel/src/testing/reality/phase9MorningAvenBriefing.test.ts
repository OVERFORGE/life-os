import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

import { MorningBriefingEngine } from "../../experience/morning/MorningBriefingEngine";
import { MorningWakeDetector } from "../../experience/morning/MorningWakeDetector";
import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";
import { MorningBriefingModel } from "../../../../../apps/web/server/db/models/MorningBriefingModel";
import { IKernelCapabilityService } from "../../orchestration/kernel/IKernelCapabilityService";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

test("PHASE 9: Morning Aven / Jarvis Executive Briefing Suite", async (suite) => {
  const testUserId = "test-user-morning-phase9-" + Date.now();
  const testDate = "2026-10-04";

  suite.before(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: "lifeos" });
    }
  });

  suite.after(async () => {
    if (mongoose.connection.readyState === 1) {
      await MorningBriefingModel.deleteMany({ userId: testUserId });
      await mongoose.disconnect();
    }
  });

  const createBaseProjection = (sleepScore: number, meetingMinutes: number): any => ({
    metadata: {
      projectionId: "proj-morn-1",
      userId: testUserId,
      sourceSnapshotVersion: 1,
      computedAt: Date.now(),
      observedAt: Date.now(),
      validUntil: Date.now() + 600000,
      freshness: "FRESH",
      provenance: "test",
      confidence: 0.95,
      isDegradedContext: false,
    },
    identity: {
      userId: testUserId,
      name: "Marcus",
      timezone: "UTC",
      activeRole: "Founder",
    },
    preferences: { explicitRules: [], learnedHabits: [] },
    execution: {
      activeLifeState: "BALANCED_EXECUTION",
      taskVelocityScore: 0.8,
      activeBacklogCount: 4,
      criticalPathLength: 2,
      topGoalPressures: [{ goalId: "g-arch", title: "Complete Jarvis Architecture", pressureScore: 0.88 }],
    },
    cognitive: {
      overallReadiness: sleepScore >= 0.7 ? 0.85 : 0.45,
      stressTier: sleepScore >= 0.7 ? "LOW" : "HIGH",
      focusCapacityMinutes: sleepScore >= 0.7 ? 90 : 30,
      cognitiveLoadEstimate: 0.35,
      evidenceConfidence: 0.9,
      requiresUserConfirmation: false,
    },
    physical: {
      sleepDurationHours: sleepScore >= 0.7 ? 8.0 : 4.5,
      sleepRecoveryScore: sleepScore,
      physicalStrainTier: sleepScore >= 0.7 ? "RESTED" : "HIGH",
    },
    schedule: {
      firstCommitmentTimestamp: new Date("2026-10-04T09:30:00Z").getTime(),
      totalMeetingMinutesToday: meetingMinutes,
      meetingFragmentationScore: meetingMinutes > 180 ? 0.75 : 0.2,
      availableDeepWorkWindows: [
        {
          startTimestamp: new Date("2026-10-04T10:00:00Z").getTime(),
          endTimestamp: new Date("2026-10-04T12:00:00Z").getTime(),
          durationMinutes: 120,
        },
      ],
    },
    constraints: { activeConstraints: [], activeIncidentIds: [], quietHoursActive: false },
  });

  await suite.test("MORN-01: Morning Briefing Synthesis (Rested vs Depleted Day)", async () => {
    const engine = MorningBriefingEngine.getInstance();
    engine.clearCache(testUserId);

    // Case A: Rested day
    const restedProj = createBaseProjection(0.85, 90);
    const restedBriefing = await engine.generateBriefing(restedProj, `${testDate}-rested`);

    assert.equal(restedBriefing.recoveryStatus, "RESTED");
    assert.ok(restedBriefing.readinessHeadline.includes("well rested"));
    assert.equal(restedBriefing.scheduleOverview.densityTier, "MODERATE");
    assert.ok(restedBriefing.priorityFocusTask);
    assert.equal(restedBriefing.priorityFocusTask.title, "Complete Jarvis Architecture");

    // Case B: Depleted day with heavy schedule
    const depletedProj = createBaseProjection(0.40, 240);
    const depletedBriefing = await engine.generateBriefing(depletedProj, `${testDate}-depleted`);

    assert.equal(depletedBriefing.recoveryStatus, "DEPLETED");
    assert.ok(depletedBriefing.readinessHeadline.includes("recovery is limited"));
    assert.equal(depletedBriefing.scheduleOverview.densityTier, "OVERLOADED");
    assert.ok(depletedBriefing.proposedOptimization);
    assert.ok(depletedBriefing.proposedOptimization.description.includes("recovery buffer"));
  });

  await suite.test("MORN-02: Zero Engineering Jargon & Word Count Budget (<= 120 Words)", async () => {
    const engine = MorningBriefingEngine.getInstance();
    const proj = createBaseProjection(0.80, 120);
    const briefing = await engine.generateBriefing(proj, `${testDate}-jargon-check`);

    const transcript = briefing.transcript;

    // Check word count ceiling
    assert.ok(briefing.wordCount <= 120, `Word count must be <= 120 words, got ${briefing.wordCount}`);
    assert.ok(briefing.wordCount >= 20, `Word count must be meaningful (>= 20 words), got ${briefing.wordCount}`);

    // Check zero architecture / engineering jargon leakage (Rule 28)
    const forbiddenJargon = [
      "cross-domain",
      "tension score",
      "epistemic confidence",
      "projection slice",
      "kernel capability",
      "action proposal",
      "idempotency",
      "mongodb",
      "vector store",
    ];

    for (const jargon of forbiddenJargon) {
      assert.equal(
        transcript.toLowerCase().includes(jargon),
        false,
        `Transcript must not contain mechanical jargon: '${jargon}'`
      );
    }
  });

  await suite.test("MORN-03: Wake Detection & Idempotency Gate", async () => {
    const detector = MorningWakeDetector.getInstance();
    detector.clearHistory(testUserId);

    const proj = createBaseProjection(0.75, 60);

    // 07:15 UTC (morning window: 05:00 - 12:00)
    const morningTimestamp = new Date("2026-10-04T07:15:00Z").getTime();

    // Event 1: First wake detection -> triggers briefing
    const res1 = await detector.handleWakeEvent(
      {
        userId: testUserId,
        source: "WEARABLE_SLEEP_END",
        detectedAt: morningTimestamp,
      },
      proj,
      morningTimestamp
    );
    assert.equal(res1.triggered, true);
    assert.ok(res1.briefing);

    // Event 2: Second wake detection on the same day -> Idempotency blocks re-generation
    const res2 = await detector.handleWakeEvent(
      {
        userId: testUserId,
        source: "FIRST_APP_OPEN",
        detectedAt: morningTimestamp + 300000,
      },
      proj,
      morningTimestamp + 300000
    );
    assert.equal(res2.triggered, false);
    assert.ok(res2.reason?.includes("already generated"));

    // Event 3: Event outside morning window (16:00 UTC) -> Suppressed
    const afternoonTimestamp = new Date("2026-10-04T16:00:00Z").getTime();
    detector.clearHistory(testUserId);
    const res3 = await detector.handleWakeEvent(
      {
        userId: testUserId,
        source: "FIRST_APP_OPEN",
        detectedAt: afternoonTimestamp,
      },
      proj,
      afternoonTimestamp
    );
    assert.equal(res3.triggered, false);
    assert.ok(res3.reason?.includes("outside morning window"));
  });

  await suite.test("MORN-04: 1-Tap Optimization Acceptance via Kernel Boundary", async () => {
    const engine = MorningBriefingEngine.getInstance();
    engine.clearCache(testUserId);

    // Create a briefing with proposed optimization
    const depletedProj = createBaseProjection(0.40, 240);
    const briefing = await engine.generateBriefing(depletedProj, testDate);
    assert.ok(briefing.proposedOptimization);

    // Mock KernelCapabilityService tracking executions
    let executedUrn: string | undefined;
    const mockKernel: Partial<IKernelCapabilityService> = {
      validateActionProposals: async () => ({ valid: true, validDecisions: [], rejectedProposals: [] }),
      executeActionBatch: async () => [],
      executeAction: async (_u, proposal) => {
        executedUrn = (proposal as any).capabilityURN;
        return {
          executionId: "exec-morn-1",
          status: "SUCCESS",
          capabilityURN: (proposal as any).capabilityURN,
          committedAt: Date.now(),
        } as any;
      },
      readAuthoritativeState: async () => ({} as any),
      verifyOutcome: async () => ({} as any),
    };

    const res = await engine.acceptOptimization(testUserId, briefing.briefingId, mockKernel as IKernelCapabilityService);
    assert.equal(res.success, true);
    assert.equal(executedUrn, "urn:lifeos:action:create_internal_focus_block");
  });

  await suite.test("MORN-05: Adversarial Empty Day (0 Calendar Events & 0 Tasks)", async () => {
    const engine = MorningBriefingEngine.getInstance();
    engine.clearCache(testUserId);

    // Clean slate projection with 0 meetings and 0 backlog
    const emptyProj: any = {
      ...createBaseProjection(0.80, 0),
      execution: {
        activeLifeState: "BALANCED_EXECUTION",
        taskVelocityScore: 0.5,
        activeBacklogCount: 0,
        criticalPathLength: 0,
        topGoalPressures: [],
      },
      schedule: {
        firstCommitmentTimestamp: undefined,
        totalMeetingMinutesToday: 0,
        meetingFragmentationScore: 0.0,
        availableDeepWorkWindows: [
          { startTimestamp: Date.now(), endTimestamp: Date.now() + 14400000, durationMinutes: 240 },
        ],
      },
    };

    const briefing = await engine.generateBriefing(emptyProj, `${testDate}-empty-day`);
    assert.ok(briefing.transcript.length > 20);
    assert.equal(briefing.scheduleOverview.densityTier, "LIGHT");
    assert.equal(briefing.scheduleOverview.firstCommitmentTime, "None scheduled");
    assert.ok(briefing.transcript.includes("Your schedule is open"));
  });

  await suite.test("MORN-06: MongoDB Persistence in MorningBriefingModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const count = await MorningBriefingModel.countDocuments({ userId: testUserId });
    assert.ok(count >= 1, `Expected at least 1 morning briefing in DB, found ${count}`);

    const doc = await MorningBriefingModel.findOne({ userId: testUserId });
    assert.ok(doc);
    assert.ok(doc.briefingId.startsWith("brief_") || doc.briefingId.startsWith("brief-"));
    assert.ok(doc.transcript);
    assert.ok(doc.readinessScore > 0);
  });
});
