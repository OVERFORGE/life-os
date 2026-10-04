import test from "node:test";
import assert from "node:assert/strict";

import { AutonomyPolicyManager } from "../../proactive/AutonomyPolicyManager";
import { AutonomousActionReverser } from "../../autonomy/AutonomousActionReverser";
import { AutonomyAuditFeed } from "../../autonomy/AutonomyAuditFeed";
import { IKernelCapabilityService } from "../../orchestration/kernel/IKernelCapabilityService";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";
import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";

test("PHASE 15: Controlled Autonomous Life Management Suite", async (suite) => {
  const testUserId = "user-phase15-" + Date.now();
  const reverser = AutonomousActionReverser.getInstance();
  const policyManager = AutonomyPolicyManager.getInstance();
  const auditFeed = AutonomyAuditFeed.getInstance();

  // Reset in-memory state for clean test run
  reverser.clearRecords(testUserId);
  policyManager.resetCircuitBreaker(testUserId);

  await suite.test("AUTO-01: Level 5 Eligibility (Strictly LOW Risk & Reversible Only)", async () => {
    // 1. Eligible candidate: Internal, reversible, low-risk
    const eligibleCandidate: IProactiveCandidate = {
      candidateId: "cand-focus-1",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "LOW",
      domain: "FOCUS",
      proposal: {
        proposalId: "prop-focus-1",
        capabilityURN: "urn:lifeos:action:create_internal_focus_block",
        intentCategory: "CREATE_TASK",
        parameters: { durationMinutes: 90 },
        confidence: 0.92,
        provenance: "TestHarness",
        requiresConfirmation: false,
        estimatedImpactScore: 0.2,
      } as unknown as ActionProposal,
      rationale: "Deep work buffer protection",
      requiredConfidence: 0.85,
      dedupKey: "dedup-focus-1",
      actionValueScore: 0.85,
      estimatedInterruptionCost: 0.1,
      createdAt: Date.now(),
    };

    const evalEligible = policyManager.evaluateAutonomyEligibility(eligibleCandidate, "L5");
    assert.equal(evalEligible.eligible, true);
    assert.equal(evalEligible.effectiveAutonomyLevel, "L5");
    assert.equal(evalEligible.requiresApproval, false, "LOW risk internal reversible action may execute at L5");

    // 2. Ineligible candidate: External mutation / high risk
    const criticalCandidate: IProactiveCandidate = {
      candidateId: "cand-crit-1",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "HIGH",
      domain: "SCHEDULE",
      proposal: {
        proposalId: "prop-del-1",
        capabilityURN: "urn:lifeos:action:delete_calendar_event",
        intentCategory: "MODIFY_SCHEDULE",
        parameters: { eventId: "evt_123" },
        confidence: 0.99,
        provenance: "TestHarness",
        requiresConfirmation: false,
        estimatedImpactScore: 0.9,
      } as unknown as ActionProposal,
      rationale: "Clear calendar slot",
      requiredConfidence: 0.90,
      dedupKey: "dedup-crit-1",
      actionValueScore: 0.95,
      estimatedInterruptionCost: 0.8,
      createdAt: Date.now(),
    };

    const evalCritical = policyManager.evaluateAutonomyEligibility(criticalCandidate, "L5");
    assert.equal(evalCritical.eligible, true);
    assert.equal(evalCritical.effectiveAutonomyLevel, "L4", "Must be demoted to L4");
    assert.equal(evalCritical.requiresApproval, true, "CRITICAL/External actions CANNOT execute autonomously at L5");
  });

  await suite.test("AUTO-02: Epistemic Confidence Non-Authorization Invariant", async () => {
    // CONSTITUTIONAL RULE: "Confidence is epistemic information, not execution authorization.
    // Never implement: confidence >= X -> execute."
    const highConfidenceCandidate: IProactiveCandidate = {
      candidateId: "cand-high-conf",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "CRITICAL",
      domain: "SYSTEM",
      proposal: {
        proposalId: "prop-email-1",
        capabilityURN: "urn:lifeos:action:send_external_communication",
        intentCategory: "COMMUNICATE",
        parameters: { recipient: "boss@corp.com", body: "Draft message" },
        confidence: 0.99999,
        provenance: "AvenExecutive",
        requiresConfirmation: false,
        estimatedImpactScore: 0.95,
      } as unknown as ActionProposal,
      rationale: "99.999% certain user intended to send this",
      requiredConfidence: 0.95,
      dedupKey: "dedup-email-1",
      actionValueScore: 0.99,
      estimatedInterruptionCost: 0.7,
      createdAt: Date.now(),
    };

    const result = policyManager.evaluateAutonomyEligibility(highConfidenceCandidate, "L5");
    assert.equal(
      result.requiresApproval,
      true,
      "High epistemic confidence (0.99999) must NOT authorize autonomous external execution"
    );
    assert.equal(result.effectiveAutonomyLevel, "L4");
  });

  await suite.test("AUTO-03: Deterministic Compensation Reversal & 30-Day Adaptive Lock", async () => {
    let kernelExecuted = false;
    let executedProposal: any = null;

    const mockKernel: Partial<IKernelCapabilityService> = {
      executeAction: async (uId, proposal) => {
        kernelExecuted = true;
        executedProposal = proposal;
        return {
          success: true,
          executionId: "exec_comp_1",
          stateUpdates: {},
          metrics: { executionLatencyMs: 4 },
        } as any;
      },
    };

    // 1. Record an autonomous action
    const ruleId = "policy_rule_focus_block_auto";
    const record = await reverser.recordAutonomousExecution(
      testUserId,
      "urn:lifeos:action:create_internal_focus_block",
      { durationMinutes: 60, slotId: "slot_morning_1" },
      "Proactively secured 60min deep work",
      {
        capabilityURN: "urn:lifeos:action:remove_internal_focus_block",
        parameters: { slotId: "slot_morning_1" },
        expectedReversionEffect: "Focus block removed from internal planner",
      },
      ruleId,
      0.91
    );

    assert.ok(record.executionId);
    assert.equal(record.reversibility, "REVERSIBLE_EXACT");
    assert.equal(record.riskClass, "LOW");

    // Rule is not yet locked
    assert.equal(reverser.isRuleLocked(testUserId, ruleId), false);

    // 2. User initiates compensation / undo
    const compResult = await reverser.executeCompensation(
      testUserId,
      record.executionId,
      mockKernel as IKernelCapabilityService
    );

    assert.equal(compResult.success, true);
    assert.equal(compResult.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.equal(kernelExecuted, true);
    assert.equal(executedProposal?.capabilityURN, "urn:lifeos:action:remove_internal_focus_block");

    // 3. Verify record updated
    const updatedRecord = reverser.getRecord(record.executionId);
    assert.ok(updatedRecord?.undoneAt);
    assert.equal(updatedRecord?.userFeedback, "REVERSED");

    // 4. Verify 30-day adaptive lockout on this rule
    assert.equal(reverser.isRuleLocked(testUserId, ruleId), true, "Rule must be locked into L4 for 30 days");
  });

  await suite.test("AUTO-04: Unexpected External Drift Triggers UNKNOWN_EXTERNAL_STATE", async () => {
    const driftKernel: Partial<IKernelCapabilityService> = {
      executeAction: async () => {
        throw new Error("External state drift detected: slot was modified concurrently by external calendar");
      },
    };

    const record = await reverser.recordAutonomousExecution(
      testUserId,
      "urn:lifeos:action:stage_task_draft",
      { taskId: "draft_task_44" },
      "Staged priority item",
      {
        capabilityURN: "urn:lifeos:action:delete_staged_task",
        parameters: { taskId: "draft_task_44" },
        expectedReversionEffect: "Task deleted",
      },
      "rule_stage_task",
      0.88
    );

    const compResult = await reverser.executeCompensation(
      testUserId,
      record.executionId,
      driftKernel as IKernelCapabilityService
    );

    assert.equal(compResult.success, false);
    assert.equal(
      compResult.lifecycleState,
      "UNKNOWN_EXTERNAL_STATE",
      "External drift must yield UNKNOWN_EXTERNAL_STATE, never fake success"
    );
    assert.equal(compResult.reconciliationRequired, true);
  });

  await suite.test("AUTO-05: Retention Window Expiry (24 Hours)", async () => {
    const mockKernel: Partial<IKernelCapabilityService> = {
      executeAction: async () => ({ success: true } as any),
    };

    const record = await reverser.recordAutonomousExecution(
      testUserId,
      "urn:lifeos:action:cache_refresh",
      {},
      "Background cache refresh",
      {
        capabilityURN: "urn:lifeos:action:cache_invalidate",
        parameters: {},
        expectedReversionEffect: "Invalidate cache",
      },
      "rule_cache_refresh",
      0.95
    );

    // Simulate 25 hours later
    const twentyFiveHoursLater = Date.now() + 25 * 3600 * 1000;

    const result = await reverser.executeCompensation(
      testUserId,
      record.executionId,
      mockKernel as IKernelCapabilityService,
      twentyFiveHoursLater
    );

    assert.equal(result.success, false);
    assert.equal(result.lifecycleState, "EXTERNAL_REJECTED");
    assert.ok(result.error?.includes("Retention window (24h) expired"));
  });

  await suite.test("AUTO-06: Idempotent Compensation Prevention", async () => {
    const mockKernel: Partial<IKernelCapabilityService> = {
      executeAction: async () => ({ success: true } as any),
    };

    const record = await reverser.recordAutonomousExecution(
      testUserId,
      "urn:lifeos:action:create_internal_focus_block",
      { slot: 1 },
      "Auto slot",
      {
        capabilityURN: "urn:lifeos:action:remove_internal_focus_block",
        parameters: { slot: 1 },
        expectedReversionEffect: "Revert",
      },
      "rule_idem",
      0.90
    );

    // First undo succeeds
    const firstUndo = await reverser.executeCompensation(
      testUserId,
      record.executionId,
      mockKernel as IKernelCapabilityService
    );
    assert.equal(firstUndo.success, true);

    // Second undo is rejected
    const secondUndo = await reverser.executeCompensation(
      testUserId,
      record.executionId,
      mockKernel as IKernelCapabilityService
    );
    assert.equal(secondUndo.success, false);
    assert.equal(secondUndo.lifecycleState, "EXTERNAL_REJECTED");
    assert.ok(secondUndo.error?.includes("already been compensated"));
  });

  await suite.test("AUTO-07: Autonomy Audit Feed Transparency", async () => {
    const feed = await auditFeed.getFeed(testUserId, 10);
    assert.ok(Array.isArray(feed));
    assert.ok(feed.length >= 3, `Expected at least 3 audit records in feed, got ${feed.length}`);

    const item = feed[0];
    assert.ok(item.executionId);
    assert.ok(item.capabilityURN);
    assert.ok(item.actionTitle);
    assert.ok(item.rationale);
    assert.equal(typeof item.isCompensated, "boolean");
    assert.equal(typeof item.canCompensate, "boolean");
  });
});
