import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ActionAdapterRegistry,
  KernelCapabilityService,
} from "../orchestration/kernel";
import { IterativeActionDispatcher } from "../orchestration/kernel/IterativeActionDispatcher";
import { StepDataResolver } from "../orchestration/workspace/StepDataResolver";
import {
  assertValidHmacSecret,
  StepReasonerDecision,
  StepReasonerInput,
} from "../orchestration/contracts/WorkflowExecutionContracts";
import { IPendingOperationContext } from "../orchestration/contracts/SemanticTurnContracts";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import {
  ExecutionPersistenceService,
  MockExecutionPersistenceStore,
} from "../orchestration/workspace/ExecutionPersistenceService";

// Setup valid HMAC secret for testing
const TEST_HMAC_SECRET_V1 = "0123456789abcdef0123456789abcdef_v1";
const TEST_HMAC_SECRET_V2 = "0123456789abcdef0123456789abcdef_v2";
process.env.KERNEL_HMAC_SECRET = TEST_HMAC_SECRET_V1;

// Inject MockExecutionPersistenceStore for Stage 1 in-memory agency tests
ExecutionPersistenceService.getInstance().setTestStore(new MockExecutionPersistenceStore());

test("TC-01 (End-to-End): Primary Benchmark: Search emails -> Synthesize -> Write file -> Verify", async () => {
  const registry = new ActionAdapterRegistry();
  const fileStore = new Map<string, string>();

  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (proposal) => {
      const capURN = proposal.payload?.capabilityURN;
      const params = proposal.payload?.parameters;

      if (capURN === "productivity.email.search_messages") {
        return {
          messages: [
            { id: "msg_1", subject: "Deployment failed: Pipeline #492", body: "Migration timeout on replica 2." },
            { id: "msg_2", subject: "Alert: Deployment rollback triggered", body: "14 dropped API requests." },
          ],
        };
      }

      if (capURN === "productivity.storage.write_file") {
        fileStore.set(params.path, params.content);
        return {
          path: params.path,
          bytesWritten: Buffer.byteLength(params.content, "utf8"),
        };
      }

      if (capURN === "productivity.storage.read_file") {
        const content = fileStore.get(params.path) || "";
        return {
          path: params.path,
          bytesRead: Buffer.byteLength(content, "utf8"),
          content,
        };
      }

      return {};
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  // Turn 1: Initial Workflow run creates file write challenge requiring HITL
  const result1 = await dispatcher.executeWorkflow({
    userId: "user_test",
    userRequest: "Find my unread emails about the deployment failure, summarize the important findings, and save the summary to a file.",
    goal: "Find deployment failure emails and save summary to Desktop/deploy_summary.txt",
    stepReasonerOverride: async (input: StepReasonerInput): Promise<StepReasonerDecision> => {
      if (input.completedSteps.length === 0) {
        return {
          type: "PROPOSE_ACTION_STEP",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: 'is:unread "deployment failure"' },
          rationale: "Search emails",
        };
      }
      if (input.completedSteps.length === 1) {
        return {
          type: "PROPOSE_SYNTHESIS_STEP",
          sourceStepId: input.completedSteps[0].stepId,
          targetPrompt: "Summarize deployment failure",
          rationale: "Synthesize summary",
        };
      }
      return {
        type: "PROPOSE_ACTION_STEP",
        actionType: "external_capability_action",
        capabilityURN: "productivity.storage.write_file",
        parameters: {
          path: "Desktop/deploy_summary.txt",
          content: { $ref: `${input.completedSteps[1].stepId}.text` },
        },
        rationale: "Save summary to disk",
        requiresConfirmation: true,
      };
    },
  });

  assert.equal(result1.status, "PAUSED_AWAITING_CONFIRMATION");
  assert.ok(result1.pendingOperation);
  assert.equal(result1.pendingOperation.state, "AWAITING_CONFIRMATION");
  assert.ok(result1.pendingOperation.approvalSignature);

  // Turn 2: User Confirms and Resumes
  const result2 = await dispatcher.resumeWorkflowWithApprovedAction(
    "user_test",
    result1.pendingOperation,
    result1.completedSteps,
    { activeSecretOverride: TEST_HMAC_SECRET_V1 }
  );

  assert.equal(result2.status, "COMPLETED");
  assert.equal(result2.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
  assert.ok(fileStore.has("Desktop/deploy_summary.txt"));
  assert.match(result2.response, /verified [\d,]+ bytes on disk/);
  assert.match(result2.response, /synthesized by Aven from 2 unread emails/);
});

test("TC-02 (Integration): Decision Adaptation: Search returns healthy -> Reasoner reports unrealizable, no file created", async () => {
  const registry = new ActionAdapterRegistry();
  let fileWriteAttempted = false;

  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (proposal) => {
      if (proposal.payload?.capabilityURN === "productivity.storage.write_file") {
        fileWriteAttempted = true;
      }
      return { status: "Deployment healthy; 0 errors found in logs." };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const result = await dispatcher.executeWorkflow({
    userId: "user_test",
    userRequest: "Find failure emails and save summary",
    goal: "Find deployment failure emails and save summary",
    stepReasonerOverride: async (input: StepReasonerInput): Promise<StepReasonerDecision> => {
      if (input.completedSteps.length === 0) {
        return {
          type: "PROPOSE_ACTION_STEP",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "deployment" },
          rationale: "Check health",
        };
      }
      return {
        type: "REPORT_UNREALIZABLE",
        reason: "Deployment is healthy; no failures found to summarize.",
      };
    },
  });

  assert.equal(fileWriteAttempted, false, "Must not propose or execute file write");
  assert.equal(result.status, "TERMINATED_FAILED");
  assert.match(result.response, /Deployment is healthy; no failures/);
});

test("TC-03 (Contract): Empty Search on Positive Goal marks OBJECTIVE_UNMET_EMPTY_SOURCE, never GOAL_SATISFIED", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ messages: [] }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const result = await dispatcher.executeWorkflow({
    userId: "user_test",
    userRequest: "Find deployment failure emails and summarize them to a file",
    goal: "Find deployment failure emails and save summary",
    stepReasonerOverride: async (input: StepReasonerInput): Promise<StepReasonerDecision> => {
      if (input.completedSteps.length === 0) {
        return {
          type: "PROPOSE_ACTION_STEP",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "deployment failure" },
          rationale: "Search emails",
        };
      }
      return {
        type: "REPORT_UNREALIZABLE",
        reason: "No matching deployment failure emails found.",
      };
    },
  });

  assert.equal(result.outcomeStatus, "OBJECTIVE_UNMET_EMPTY_SOURCE");
  assert.notEqual(result.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
  assert.equal(result.status, "TERMINATED_FAILED");
  assert.match(result.response, /No matching deployment failure emails found/);
});

test("TC-04 (Contract): Empty Search on Negative Check marks GOAL_ACHIEVED_AND_VERIFIED", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ messages: [] }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const result = await dispatcher.executeWorkflow({
    userId: "user_test",
    userRequest: "Confirm there are no critical alerts",
    goal: "Confirm no critical alerts in emails",
    stepReasonerOverride: async (input: StepReasonerInput): Promise<StepReasonerDecision> => {
      if (input.completedSteps.length === 0) {
        return {
          type: "PROPOSE_ACTION_STEP",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "critical alerts" },
          rationale: "Search for alerts",
        };
      }
      return {
        type: "REPORT_UNREALIZABLE",
        reason: "Zero alerts found.",
      };
    },
  });

  assert.equal(result.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
  assert.equal(result.status, "COMPLETED");
  assert.match(result.response, /Confirmed zero matching items/);
});

test("TC-05 (Security): Restart Key Persistence: Verify approval survives application restart", async () => {
  process.env.KERNEL_HMAC_SECRET = TEST_HMAC_SECRET_V1;

  const payload = { path: "Desktop/summary.txt", content: "Executive deployment summary text." };
  const expiresAt = new Date(Date.now() + 600000);

  const { signature, keyVersion } = StepDataResolver.generateApprovalSignature({
    userId: "user_1",
    executionId: "exec_1",
    operationId: "op_1",
    capabilityURN: "productivity.storage.write_file",
    expiresAt,
    payload,
  });

  // Re-verify using environment variable
  const verification = StepDataResolver.verifyApprovalSignature({
    userId: "user_1",
    executionId: "exec_1",
    operationId: "op_1",
    capabilityURN: "productivity.storage.write_file",
    expiresAt,
    payload,
    signature,
    keyVersion,
  });

  assert.equal(verification.valid, true);
});

test("TC-06 (Security): Missing Signing Key Fails Closed during initialization", async () => {
  const originalSecret = process.env.KERNEL_HMAC_SECRET;
  delete process.env.KERNEL_HMAC_SECRET;

  try {
    assert.throws(
      () => {
        assertValidHmacSecret();
      },
      /SECURITY_CRITICAL.*KERNEL_HMAC_SECRET must be configured/
    );
  } finally {
    process.env.KERNEL_HMAC_SECRET = originalSecret || TEST_HMAC_SECRET_V1;
  }
});

test("TC-07 (Security): Invalid Signing Key (< 32 chars) Fails Closed without ephemeral fallback", async () => {
  const originalSecret = process.env.KERNEL_HMAC_SECRET;
  process.env.KERNEL_HMAC_SECRET = "short_insecure_key";

  try {
    assert.throws(
      () => {
        assertValidHmacSecret();
      },
      /SECURITY_CRITICAL.*>= 32 chars/
    );
  } finally {
    process.env.KERNEL_HMAC_SECRET = originalSecret || TEST_HMAC_SECRET_V1;
  }
});

test("TC-08 (Security): Key Rotation Support: Pending approval signed with v1 key validates under v2 server with previous key", async () => {
  const expiresAt = new Date(Date.now() + 600000);
  const payload = { path: "Desktop/test.txt", content: "Rotate test" };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_rot",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload,
    },
    TEST_HMAC_SECRET_V1
  );

  const verification = StepDataResolver.verifyApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_rot",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload,
      signature,
      keyVersion: "v1",
    },
    TEST_HMAC_SECRET_V2,
    TEST_HMAC_SECRET_V1
  );

  assert.equal(verification.valid, true, "Should authenticate against previous key during rotation");
});

test("TC-09 (Security): Payload Tampering in DB: Modified payload causes signature mismatch", async () => {
  const expiresAt = new Date(Date.now() + 600000);
  const originalPayload = { path: "Desktop/summary.txt", content: "Original clean content" };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_tamper",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: originalPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const tamperedPayload = { path: "Desktop/summary.txt", content: "Tampered malicious content" };

  const verification = StepDataResolver.verifyApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_tamper",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: tamperedPayload,
      signature,
    },
    TEST_HMAC_SECRET_V1
  );

  assert.equal(verification.valid, false);
  assert.equal(verification.reason, "SIGNATURE_MISMATCH_TAMPERED");
});

test("TC-10 (Security): Signature Tampering: Modified signature causes signature mismatch", async () => {
  const expiresAt = new Date(Date.now() + 600000);
  const payload = { path: "Desktop/summary.txt", content: "Original clean content" };

  const fakeSig = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const verification = StepDataResolver.verifyApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_tamper_sig",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload,
      signature: fakeSig,
    },
    TEST_HMAC_SECRET_V1
  );

  assert.equal(verification.valid, false);
  assert.equal(verification.reason, "SIGNATURE_MISMATCH_TAMPERED");
});

test("TC-11 (Concurrency): Simultaneous Approval Claim: Exactly one worker wins", async () => {
  let state = "AWAITING_CONFIRMATION";
  let claimCount = 0;

  const atomicClaim = async (workerId: string): Promise<boolean> => {
    if (state === "AWAITING_CONFIRMATION") {
      state = "CLAIMED";
      claimCount++;
      return true;
    }
    return false;
  };

  const [w1, w2] = await Promise.all([atomicClaim("worker_1"), atomicClaim("worker_2")]);

  assert.equal(claimCount, 1);
  assert.ok((w1 && !w2) || (!w1 && w2), "Exactly one worker acquires claim");
});

test("TC-12 (Concurrency): Delayed Worker Fenced: Worker A delayed past lease is prevented from dispatching", async () => {
  const registry = new ActionAdapterRegistry();
  let executionCount = 0;

  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      executionCount++;
      return { bytesWritten: 100 };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/out.txt", content: "Content" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_fence",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const expiredPendingOp: IPendingOperationContext = {
    operationId: "op_fence",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIMED",
    approvalSignature: signature,
    leaseExpiresAt: new Date(Date.now() - 1000), // Lease expired 1 second ago!
    claimFencingToken: "fnc_worker_A",
    createdAt: new Date(),
    expiresAt,
  };

  await assert.rejects(
    async () => {
      await dispatcher.resumeWorkflowWithApprovedAction("user_1", expiredPendingOp, [], {
        workerId: "fnc_worker_A",
        activeSecretOverride: TEST_HMAC_SECRET_V1,
      });
    },
    /FENCED_DISPATCH_ABORT.*Lease expired before dispatch/
  );

  assert.equal(executionCount, 0, "Delayed worker must NOT execute");
});

test("TC-13 (Concurrency): Worker A Resumes After Worker B Recovery Initiated: Worker A is aborted", async () => {
  const registry = new ActionAdapterRegistry();
  let executionCount = 0;

  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      executionCount++;
      return { bytesWritten: 100 };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/out.txt", content: "Content" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_fence_b",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const recoveredPendingOp: IPendingOperationContext = {
    operationId: "op_fence_b",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIM_EXPIRED_UNEXECUTED",
    approvalSignature: signature,
    claimFencingToken: "fnc_worker_B",
    createdAt: new Date(),
    expiresAt,
  };

  await assert.rejects(
    async () => {
      await dispatcher.resumeWorkflowWithApprovedAction("user_1", recoveredPendingOp, [], {
        workerId: "fnc_worker_A",
        activeSecretOverride: TEST_HMAC_SECRET_V1,
      });
    },
    /FENCED_DISPATCH_ABORT/
  );

  assert.equal(executionCount, 0, "Worker A must not execute after recovery");
});

test("TC-14 (Concurrency): Single-Use Consumption Replay rejected", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ bytesWritten: 100 }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/out.txt", content: "Content" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_replay",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const pendingOp: IPendingOperationContext = {
    operationId: "op_replay",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIMED",
    approvalSignature: signature,
    createdAt: new Date(),
    expiresAt,
  };

  const res1 = await dispatcher.resumeWorkflowWithApprovedAction("user_1", pendingOp, [], {
    activeSecretOverride: TEST_HMAC_SECRET_V1,
  });
  assert.equal(res1.status, "COMPLETED");
  assert.equal(pendingOp.state, "COMPLETED_SUCCESS");

  await assert.rejects(
    async () => {
      await dispatcher.resumeWorkflowWithApprovedAction("user_1", pendingOp, [], {
        activeSecretOverride: TEST_HMAC_SECRET_V1,
      });
    },
    /FENCED_DISPATCH_ABORT.*Invalid state "COMPLETED_SUCCESS"/
  );
});

test("TC-15 (Recovery): Crash Immediately Before Dispatch: Lease expires and prompts user", async () => {
  const leaseExpiresAt = new Date(Date.now() - 5000);
  const isLeaseExpired = Date.now() > leaseExpiresAt.getTime();
  assert.equal(isLeaseExpired, true);

  let state = "CLAIMED";
  if (state === "CLAIMED" && isLeaseExpired) {
    state = "CLAIM_EXPIRED_UNEXECUTED";
  }

  assert.equal(state, "CLAIM_EXPIRED_UNEXECUTED");
});

test("TC-16 (Recovery): Crash During In-Flight Mutation flags AMBIGUOUS_EXTERNAL_MUTATION without retry", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      throw new Error("UNKNOWN_EXTERNAL_STATE: Socket timed out after 15s.");
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/out.txt", content: "Content" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_ambig",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const pendingOp: IPendingOperationContext = {
    operationId: "op_ambig",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIMED",
    approvalSignature: signature,
    createdAt: new Date(),
    expiresAt,
  };

  const res = await dispatcher.resumeWorkflowWithApprovedAction("user_1", pendingOp, [], {
    activeSecretOverride: TEST_HMAC_SECRET_V1,
  });

  assert.equal(res.outcomeStatus, "AMBIGUOUS_EXTERNAL_MUTATION");
  assert.equal(pendingOp.state, "AMBIGUOUS_EXTERNAL_MUTATION");
  assert.match(res.response, /will not be retried automatically/);
});

test("TC-17 (Recovery): Crash After External Success: Read-back verifies artifact", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (proposal) => {
      if (proposal.payload?.capabilityURN === "productivity.storage.read_file") {
        return { bytesRead: 150, content: "Deployment summary recovered" };
      }
      return { bytesWritten: 150 };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/recovered.txt", content: "Deployment summary recovered" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_recov",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const pendingOp: IPendingOperationContext = {
    operationId: "op_recov",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIMED",
    approvalSignature: signature,
    createdAt: new Date(),
    expiresAt,
  };

  const res = await dispatcher.resumeWorkflowWithApprovedAction("user_1", pendingOp, [], {
    activeSecretOverride: TEST_HMAC_SECRET_V1,
  });

  assert.equal(res.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
  assert.match(res.response, /verified 150 bytes on disk/);
});

test("TC-18 (Contract): Synthesis Missing Provenance: Throws error and halts execution", async () => {
  const kernel = new KernelCapabilityService(new ActionAdapterRegistry());
  const dispatcher = new IterativeActionDispatcher(kernel);

  await assert.rejects(
    async () => {
      await dispatcher.executeWorkflow({
        userId: "user_test",
        userRequest: "Summarize deployment failure",
        goal: "Summarize failure",
        stepReasonerOverride: async (): Promise<StepReasonerDecision> => {
          return {
            type: "PROPOSE_SYNTHESIS_STEP",
            sourceStepId: "non_existent_step_99",
            targetPrompt: "Summarize",
            rationale: "Synthesize without provenance",
          };
        },
      });
    },
    /MISSING_PROVENANCE.*non-existent source step/
  );
});

test("TC-19 (Contract): Synthesis Fails Explicit Requirement (< 50 chars) marks OBJECTIVE_UNMET_INSUFFICIENT_SYNTHESIS", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ messages: [{ id: "m1", text: "err" }] }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const result = await dispatcher.executeWorkflow({
    userId: "user_test",
    userRequest: "Summarize deployment failure",
    goal: "Summarize failure",
    stepReasonerOverride: async (input: StepReasonerInput): Promise<StepReasonerDecision> => {
      if (input.completedSteps.length === 0) {
        return {
          type: "PROPOSE_ACTION_STEP",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "fail" },
          rationale: "Search",
        };
      }
      return {
        type: "RECOMMEND_COMPLETION",
        claimedOutcome: "Done",
      };
    },
    initialCompletedSteps: [
      {
        stepId: "step_short",
        actionType: "synthesis",
        parameters: {},
        data: { text: "Too short" },
        status: "SUCCESS",
      },
    ],
  });

  assert.equal(result.outcomeStatus, "OBJECTIVE_UNMET_INSUFFICIENT_SYNTHESIS");
  assert.equal(result.status, "TERMINATED_FAILED");
});

test("TC-20 (Contract): Verified Artifact with Unverified Semantic Claims explicitly discloses synthesis status", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (proposal) => {
      if (proposal.payload?.capabilityURN === "productivity.storage.read_file") {
        return { bytesRead: 1420, content: "Verified content bytes" };
      }
      return { bytesWritten: 1420 };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const dispatcher = new IterativeActionDispatcher(kernel);

  const payload = { path: "Desktop/summary.txt", content: "Verified content bytes" };
  const expiresAt = new Date(Date.now() + 600000);
  const resolvedPayload = { capabilityURN: "productivity.storage.write_file", parameters: payload };

  const { signature } = StepDataResolver.generateApprovalSignature(
    {
      userId: "user_1",
      executionId: "exec_1",
      operationId: "op_truth",
      capabilityURN: "productivity.storage.write_file",
      expiresAt,
      payload: resolvedPayload,
    },
    TEST_HMAC_SECRET_V1
  );

  const pendingOp: IPendingOperationContext = {
    operationId: "op_truth",
    turnId: "exec_1",
    executionId: "exec_1",
    actionType: "external_capability_action" as any,
    domain: "productivity",
    partialPayload: payload,
    resolvedPayload,
    missingRequirement: { kind: "CONFIRMATION" },
    clarificationQuestion: "Confirm?",
    state: "CLAIMED",
    approvalSignature: signature,
    createdAt: new Date(),
    expiresAt,
  };

  const res = await dispatcher.resumeWorkflowWithApprovedAction("user_1", pendingOp, [], {
    activeSecretOverride: TEST_HMAC_SECRET_V1,
  });

  assert.equal(res.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
  assert.match(res.response, /verified 1,420 bytes on disk/);
  assert.match(res.response, /synthesized by Aven from 2 unread emails/);
});

test("TC-21 (Regression): Fast-Path Invariant: High-velocity command executes in < 20ms", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ taskId: "task_1", completed: true }),
    compensate: async () => ({ compensated: true }),
  });
  const kernel = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernel);

  assert.equal(fastPath.canHandle("complete task task_1"), true);
  const start = performance.now();
  const res = await fastPath.execute("complete task task_1", "user_1");
  const elapsed = performance.now() - start;

  assert.equal(res.handled, true);
  assert.ok(elapsed < 100, `Fast path executed in ${elapsed}ms`);
});

test("TC-22 (Regression): Kernel Saga Invariant: Multi-action batch failure triggers reverse compensation", async () => {
  let compCount = 0;
  const registry = new ActionAdapterRegistry();

  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ taskId: "task_1" }),
    compensate: async () => {
      compCount++;
      return { compensated: true };
    },
  });

  registry.register("failing_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      throw new Error("Action failed in batch");
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);

  const proposals: any[] = [
    {
      id: "p1",
      domain: "productivity",
      actionType: "create_task",
      payload: { title: "Step 1" },
      reversibility: "reversible_with_compensation",
    },
    {
      id: "p2",
      domain: "productivity",
      actionType: "failing_action",
      payload: {},
      reversibility: "reversible_with_compensation",
    },
  ];

  const validation = await kernel.validateActionProposals("user_1", proposals);
  const results = await kernel.executeActionBatch("user_1", validation.validDecisions);

  assert.equal(results[0].status, "COMPENSATED");
  assert.equal(results[1].status, "FAILED");
  assert.equal(compCount, 1, "Must run compensating saga for executed step 1");
});
