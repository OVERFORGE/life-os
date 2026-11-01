/**
 * step4SemanticGeneralization.test.ts
 * 
 * Step 4 Loop 7: Semantic Generalization & Anti-Keyword Verification Battery
 * 
 * Verifies that the system functions correctly on held-out domains, unfamiliar user entities,
 * and conversational prose without relying on prohibited hard-coded keyword lists or regexes.
 * 
 * Principles Enforced:
 * 1. "The kernel provides truth. Agents provide intelligence. The user provides sovereignty."
 * 2. Generalization to unseen categories and novel vocabulary.
 * 3. Kernel invariants (fencing, idempotency, causality) hold uniformly across arbitrary domain payloads.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  KernelCapabilityService,
  computeRequestFingerprint,
} from "../../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry, IKernelActionAdapter } from "../../orchestration/kernel/ActionAdapters";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";
import { ExecutionGraphProjectionService } from "../../events/projections/ExecutionGraphProjectionService";

describe("Step 4 Loop 7: Semantic Generalization & Anti-Keyword Verification", () => {

  it("1. Kernel executes arbitrary, unseen domain actions without keyword classification", async () => {
    let executedAction: ActionProposal | null = null;

    const novelAdapter: IKernelActionAdapter = {
      validatePreconditions: async (proposal: ActionProposal) => {
        if (!proposal.parameters?.entityName) {
          return { valid: false, reason: "entityName is required" };
        }
        return { valid: true };
      },
      execute: async (proposal: ActionProposal, _userId: string) => {
        executedAction = proposal;
        return {
          success: true,
          registeredEntity: proposal.parameters.entityName,
          domain: proposal.parameters.customDomain,
        };
      },
    };

    const registry = new ActionAdapterRegistry();
    // Novel action type never hardcoded in any keyword dictionary
    registry.register("quantum_biofeedback_calibration", novelAdapter);

    const auditDocs = new Map<string, any>();
    const mockAuditModel = {
      findOne: async (q: any) => auditDocs.get(`${q.userId}:${q.idempotencyKey}`) || null,
      create: async (d: any) => { auditDocs.set(`${d.userId}:${d.idempotencyKey}`, { ...d }); return d; },
      updateOne: async (q: any, u: any) => {
        const d = auditDocs.get(`${q.userId}:${q.idempotencyKey}`);
        if (d && u.$set) Object.assign(d, u.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };

    const kernel = new KernelCapabilityService(registry, { auditModel: mockAuditModel });

    const proposal: ActionProposal = {
      id: "action-novel-1",
      actionType: "quantum_biofeedback_calibration",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Unit test",
      idempotencyKey: "idemp-novel-1",
      parameters: {
        entityName: "Somatosensory Resonance Chamber Beta",
        customDomain: "Transhumanist Recovery Protocol",
        parameters: { frequencies: [432, 528], intensity: 0.8 },
      },
    };

    const result = await kernel.executeAction("user-novel-1", proposal);

    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.data.registeredEntity, "Somatosensory Resonance Chamber Beta");
    assert.equal(executedAction?.actionType, "quantum_biofeedback_calibration");
  });

  it("2. ExecutionGraph projection handles arbitrary entity names and complex topological chains", async () => {
    const mockDerived = {
      current: null as any,
      findOne: async () => mockDerived.current,
      findOneAndUpdate: async (_f: any, u: any) => {
        mockDerived.current = { ...u.$set };
        return mockDerived.current;
      },
    };

    const mockRevision = {
      findOne: async () => ({ userId: "user-generalization", graphRevision: 1 }),
    };

    // Unfamiliar, slang-filled, or poetic entity titles
    const tasks = [
      { id: "node-alpha", title: "Synthesize Lunar regolith simulants", status: "completed", dependencies: [] },
      { id: "node-beta", title: "Recalibrate the vibe check engine", status: "pending", dependencies: ["node-alpha"] },
      { id: "node-gamma", title: "Contemplate the void of non-computable states", status: "pending", dependencies: ["node-beta"] },
    ];

    const mockTask = {
      find: async () => tasks,
    };
    const mockGoal = { find: async () => [] };

    const service = new ExecutionGraphProjectionService({
      derivedModel: mockDerived,
      revisionModel: mockRevision,
      taskModel: mockTask,
      goalModel: mockGoal,
    });

    const result = await service.getGraph("user-generalization");

    assert.equal(result.source, "COLD_REBUILD");
    assert.equal(result.graph.nodes.length, 3);
    // Node beta is unblocked because Node alpha is completed
    assert.deepEqual(result.graph.unblockedTaskIds, ["node-beta"]);
    // Node gamma remains blocked because Node beta is still pending
    assert.equal(result.graph.unblockedTaskIds.includes("node-gamma"), false);
  });

  it("3. Idempotency and finger-printing behave deterministically across complex nested objects", () => {
    const payload1 = {
      zeta: 100,
      alpha: { delta: "three", beta: [1, 2, { nestedKey: "value" }] },
      omega: true,
    };
    const payload2 = {
      omega: true,
      alpha: { beta: [1, 2, { nestedKey: "value" }], delta: "three" },
      zeta: 100,
    };

    const fp1 = computeRequestFingerprint("user-test", "action_x", payload1);
    const fp2 = computeRequestFingerprint("user-test", "action_x", payload2);

    assert.equal(fp1, fp2);
    assert.equal(fp1.length, 64);
  });
});
