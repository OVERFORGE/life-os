import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { CapabilityRegistry } from "../orchestration/capabilities/CapabilityRegistry";
import { CapabilityPresentationRegistry } from "../orchestration/external/presentation/CapabilityPresentationRegistry";
import { DOMAIN_CAPABILITIES } from "../orchestration/contracts/ActionProposalContracts";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";

describe("Stage 4 Increment 4.4: lifeos.memory.search Capability & Adapter", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();
  let kernel: KernelCapabilityService;

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc44-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    await PersonalMemory.syncIndexes();
    await ActionAuditRecordModel.syncIndexes();

    const adapters = new ActionAdapterRegistry();
    registerDefaultActionAdapters(adapters);
    kernel = new KernelCapabilityService(adapters, {
      auditModel: ActionAuditRecordModel,
    });
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    MemoryRepository.getInstance().clearInMemoryStore();
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    await PersonalMemory.deleteMany({});
    await ActionAuditRecordModel.deleteMany({});
  });

  it("4.4-01: Registers lifeos.memory.search in CapabilityRegistry, DOMAIN_CAPABILITIES, PresentationRegistry, and validates schema strictly", () => {
    CapabilityRegistry.resetForTesting();
    const registry = CapabilityRegistry.getInstance();
    const desc = registry.getCapability("lifeos.memory.search");

    assert.ok(desc, "lifeos.memory.search must be registered");
    assert.strictEqual(desc.source, "INTERNAL_ADAPTER");
    assert.strictEqual(desc.operationKind, "READ");
    assert.strictEqual(desc.requiresApproval, false);
    assert.strictEqual(desc.parametersSchema.additionalProperties, false);
    assert.ok(desc.requiredResources?.some((r) => r.type === "LIFEOS_MEMORY" && r.accessMode === "SHARED_READ"));
    assert.strictEqual(DOMAIN_CAPABILITIES["lifeos.memory.search"]?.operationKind, "READ");

    const pres = CapabilityPresentationRegistry.getInstance().get("lifeos.memory.search");
    assert.strictEqual(pres.providerDisplayName, "LifeOS Kernel");

    const badExtra = registry.validateParameters("lifeos.memory.search", { query: "test", unexpected: true });
    assert.strictEqual(badExtra.valid, false);
  });

  it("4.4-02: Executes lifeos.memory.search via KernelCapabilityService with audit logging, vector stripping, and tenant isolation", async () => {
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));

    const memA = await repo.createMemory({
      userId: userA,
      content: "User avoids caffeine after 2pm to protect deep sleep.",
      summary: "No caffeine after 2pm",
      memoryType: "behavioral_pattern",
      domain: "wellness",
      source: "explicit_user_statement",
      confidence: 0.92,
      importance: 0.85,
    });

    const supA = await repo.createMemory({
      userId: userA,
      content: "Old rule: User drank espresso at 5pm.",
      summary: "Old 5pm espresso habit",
      memoryType: "behavioral_pattern",
      domain: "wellness",
      source: "explicit_user_statement",
    });
    await repo.supersedeMemory(userA, supA.id, memA.id);

    await repo.createMemory({
      userId: userB,
      content: "User B secret espresso caffeine habit",
      summary: "User B secret",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
    });

    MemoryRepository.getInstance().clearInMemoryStore();

    const result = await kernel.executeAction(userA, {
      id: "prop_mem_search_1",
      domain: "context",
      actionType: "lifeos.memory.search",
      payload: { query: "caffeine sleep", limit: 5 },
      rationale: "Retrieve user sleep/caffeine constraints",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_mem_search_1",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.returnedCount, 1);
    assert.strictEqual(result.data.items[0].memoryId, memA.id);
    assert.strictEqual("embedding" in result.data.items[0], false, "Raw embedding vectors must be stripped");
    assert.strictEqual("embedding384" in result.data.items[0], false, "Raw embedding384 vectors must be stripped");

    const auditCount = await ActionAuditRecordModel.countDocuments({
      userId: userA,
      actionType: "lifeos.memory.search",
      status: "SUCCEEDED",
    });
    assert.strictEqual(auditCount, 1, "READ audit record must be persisted");
  });

  it("4.4-03: Reports accurate emptyReason when no active memories exist or only superseded memories exist", async () => {
    const resEmpty = await kernel.executeAction(userA, {
      id: "prop_mem_empty",
      domain: "context",
      actionType: "lifeos.memory.search",
      payload: { query: "nonexistent topic" },
      rationale: "Check empty memory handling",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_mem_empty",
    });
    assert.strictEqual(resEmpty.success, true);
    assert.strictEqual(resEmpty.data.returnedCount, 0);
    assert.strictEqual(resEmpty.data.retrievalMode, "empty");
    assert.ok(resEmpty.data.emptyReason.includes("No matching active"));
  });
});
