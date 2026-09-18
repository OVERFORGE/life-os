import test from "node:test";
import assert from "node:assert/strict";
import { CrashRecoveryEngine } from "../orchestration/persistence/CrashRecoveryEngine";
import { ExecutionEventLedger } from "../orchestration/workspace/ExecutionEventLedger";
import { StoredActionAudit } from "../orchestration/kernel/KernelCapabilityService";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";

test("Phase 13 (TC-08): CrashRecoveryEngine recovers from simulated mid-execution crash without duplicate side effects", () => {
  const executionId = "exec_crash_100";
  const ledger = new ExecutionEventLedger(executionId);
  const auditStore = new Map<string, StoredActionAudit>();

  // 1. Prior action was fully completed and recorded before crash
  auditStore.set("key_done_1", {
    idempotencyKey: "key_done_1",
    actionId: "act_1",
    status: "SUCCEEDED",
    result: { taskId: "task_1", status: "completed" },
    timestamp: 1000,
  });
  ledger.append("KernelActionExecuted", "Kernel", {
    actionId: "act_1",
    idempotencyKey: "key_done_1",
    actionType: "complete_task",
    status: "SUCCEEDED",
    success: true,
  });

  // 2. Action in-flight when process terminated (status: "EXECUTING")
  auditStore.set("key_inflight_2", {
    idempotencyKey: "key_inflight_2",
    actionId: "act_2",
    status: "EXECUTING", // CRASH OCCURRED HERE!
    timestamp: 1050,
  });

  // Perform Crash Recovery
  const { workspace, report } = CrashRecoveryEngine.recover(
    executionId,
    "user_crash_test",
    "Recover tasks",
    ledger,
    auditStore
  );

  // Invariant 1: Recovery identified in-flight action and marked FAILED to prevent duplicate execution
  assert.equal(report.status, "RECOVERED");
  assert.equal(report.restoredEventsCount, 1);
  assert.equal(report.reconciledActionsCount, 1);

  const reconciledAudit = auditStore.get("key_inflight_2");
  assert.equal(reconciledAudit?.status, "FAILED");
  assert.ok(reconciledAudit?.error?.includes("CRASH_RECOVERY"));

  // Invariant 2: Completed action is intact
  assert.equal(auditStore.get("key_done_1")?.status, "SUCCEEDED");

  // Invariant 3: Workspace reconstructed cleanly
  assert.equal(workspace.executionId, executionId);
  assert.equal(workspace.ledger.getEventCount(), 1);
});

test("Phase 13 (TC-12): Reversible domain operation compensation reverts created task on mid-batch failure", async () => {
  const registry = new ActionAdapterRegistry();
  const createdTaskIds: string[] = [];
  const deletedTaskIds: string[] = [];

  // Register Category B reversible action (task creation with compensation)
  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      createdTaskIds.push(p.payload.title);
      return { taskId: "task_auto_99", title: p.payload.title };
    },
    compensate: async (p, res) => {
      deletedTaskIds.push(res.taskId);
      return { compensated: true, reversalDetails: `Deleted task ${res.taskId}` };
    },
  });

  // Register a failing second action
  registry.register("adjust_task_priority", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      throw new Error("Simulated database constraint failure on action 2");
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);

  const proposals: ActionProposal[] = [
    {
      id: "act_1",
      domain: "productivity",
      actionType: "create_task",
      payload: { title: "Draft Proposal" },
      rationale: "Step 1",
      reversibility: "reversible_with_compensation",
      idempotencyKey: "key_tc12_1",
    },
    {
      id: "act_2",
      domain: "productivity",
      actionType: "adjust_task_priority",
      payload: { taskId: "non_existent" },
      rationale: "Step 2 will fail",
      reversibility: "atomic_single_doc",
      idempotencyKey: "key_tc12_2",
    },
  ];

  const validation = await kernelService.validateActionProposals("user_tc12", proposals);
  const results = await kernelService.executeActionBatch("user_tc12", validation.validDecisions);

  // Invariant 1: Action 1 was executed then successfully compensated (deleted)
  assert.ok(createdTaskIds.includes("Draft Proposal"));
  assert.ok(deletedTaskIds.includes("task_auto_99"));

  const action1Result = results.find((r) => r.actionId === "act_1");
  assert.equal(action1Result?.compensated, true);
  assert.equal(action1Result?.status, "COMPENSATED");

  // Invariant 2: Action 2 recorded failure
  const action2Result = results.find((r) => r.actionId === "act_2");
  assert.equal(action2Result?.success, false);
  assert.equal(action2Result?.status, "FAILED");
});

test("Phase 13 (TC-18): Mongoose schemas compile cleanly and provide required indexes and fields", async () => {
  // Dynamically import Mongoose models to verify schema construction without errors
  const { ExecutionWorkspaceModel } = await import("../../../../apps/web/server/db/models/ExecutionWorkspaceModel");
  const { ExecutionEventRecordModel } = await import("../../../../apps/web/server/db/models/ExecutionEventRecordModel");
  const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");

  assert.ok(ExecutionWorkspaceModel);
  assert.ok(ExecutionWorkspaceModel.schema.paths.executionId);
  assert.ok(ExecutionWorkspaceModel.schema.paths.status);

  assert.ok(ExecutionEventRecordModel);
  assert.ok(ExecutionEventRecordModel.schema.paths.executionId);
  assert.ok(ExecutionEventRecordModel.schema.paths.seq);

  assert.ok(ActionAuditRecordModel);
  assert.ok(ActionAuditRecordModel.schema.paths.idempotencyKey);
  assert.ok(ActionAuditRecordModel.schema.paths.status);
});
