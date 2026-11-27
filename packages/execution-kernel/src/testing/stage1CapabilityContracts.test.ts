import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../orchestration/capabilities/CapabilityRegistry";
import { DOMAIN_CAPABILITIES } from "../orchestration/contracts/ActionProposalContracts";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { PlanValidator } from "../orchestration/planning/PlanValidator";
import { ConflictGovernanceEngine } from "../orchestration/graph/ConflictGovernanceEngine";
import { WorkflowExecutionGraph } from "../orchestration/graph/WorkflowExecutionGraph";
import {
  calculateInclusiveDayCount,
  clampPagination,
  validateCalendarDate,
  redactInternalFields,
  buildSanitizedReadAuditSummary,
} from "../repositories/readQueryUtils";

const STAGE1_READ_URNS = [
  "lifeos.tasks.query",
  "lifeos.goals.query",
  "lifeos.schedule.query_occurrences",
  "lifeos.daily_logs.query_range",
  "lifeos.telemetry.query_state_history",
] as const;

const EXISTING_READ_URNS = [
  "productivity.calendar.read_events",
  "productivity.email.search_messages",
  "productivity.email.read_thread",
  "productivity.email.read_message",
  "productivity.storage.read_file",
  "productivity.storage.list_files",
  "productivity.contacts.search_contacts",
  "productivity.contacts.get_contact",
  "health.biometrics.read_sleep",
  "health.biometrics.read_daily_summary",
  "wellness.media.read_current_track",
  "context.system.read_clipboard",
  "context.system.search_web",
  "context.environment.read_weather",
  "context.environment.get_forecast",
  "productivity.git.list_prs",
  "productivity.git.list_repos",
  "productivity.git.search_code",
  "productivity.task.sync_tasks",
] as const;

describe("Stage 1: Capability Contracts, Discovery & Schema Validation (Offline)", () => {
  it("registers all 5 Stage 1 read capabilities with READ operationKind and SHARED_READ", () => {
    CapabilityRegistry.resetForTesting();
    const registry = CapabilityRegistry.getInstance();

    for (const urn of STAGE1_READ_URNS) {
      const desc = registry.getCapability(urn);
      assert.ok(desc, `Missing capability descriptor for ${urn}`);
      assert.equal(desc.source, "INTERNAL_ADAPTER");
      assert.equal(desc.operationKind, "READ");
      assert.equal(desc.isIdempotent, true);
      assert.equal(desc.isReversible, false);
      assert.equal(desc.requiresApproval, false);
      assert.equal(desc.parametersSchema.additionalProperties, false);
      assert.ok(desc.outputSchema, `Missing outputSchema for ${urn}`);
      assert.ok(
        desc.requiredResources?.some((r) => r.accessMode === "SHARED_READ"),
        `Expected SHARED_READ resource for ${urn}`
      );
      assert.equal(DOMAIN_CAPABILITIES[urn]?.operationKind, "READ");
    }
  });

  it("tags all 19 existing external/system read capabilities with operationKind READ", () => {
    const registry = CapabilityRegistry.getInstance();
    for (const urn of EXISTING_READ_URNS) {
      const desc = registry.getCapability(urn);
      assert.ok(desc, `Missing existing read capability ${urn}`);
      assert.equal(desc.operationKind, "READ", `Expected operationKind READ for ${urn}`);
    }

    const readCaps = registry.listReadCapabilities();
    assert.ok(readCaps.length >= STAGE1_READ_URNS.length + EXISTING_READ_URNS.length);

    const catalog = registry.getDiscoveryCatalog({ operationKind: "READ" });
    assert.equal(catalog.length, readCaps.length);
    for (const entry of catalog) {
      assert.equal(entry.operationKind, "READ");
      assert.ok(entry.parametersSchema);
    }
  });

  it("registers all 5 Stage 1 adapters in ActionAdapterRegistry", () => {
    const adapterRegistry = new ActionAdapterRegistry();
    registerDefaultActionAdapters(adapterRegistry);
    for (const urn of STAGE1_READ_URNS) {
      assert.equal(adapterRegistry.has(urn), true, `Missing adapter for ${urn}`);
    }
  });

  it("enforces strict JSON schema validation (additionalProperties, enum, integer bounds, date pattern)", () => {
    const registry = CapabilityRegistry.getInstance();

    // Unknown property rejected
    const unknownProp = registry.validateParameters("lifeos.tasks.query", {
      userId: "spoofed",
      status: "pending",
    });
    assert.equal(unknownProp.valid, false);
    assert.match(unknownProp.reason || "", /Unknown parameter "userId"/);

    // Bad enum rejected
    const badEnum = registry.validateParameters("lifeos.tasks.query", {
      priority: "urgent",
    });
    assert.equal(badEnum.valid, false);

    // Non-integer or out-of-bounds limit rejected
    const floatLimit = registry.validateParameters("lifeos.tasks.query", { limit: 10.5 });
    assert.equal(floatLimit.valid, false);
    const overLimit = registry.validateParameters("lifeos.tasks.query", { limit: 101 });
    assert.equal(overLimit.valid, false);

    // Required fields enforced for schedule & daily logs
    const missingDates = registry.validateParameters("lifeos.schedule.query_occurrences", {
      startDate: "2026-05-01",
    });
    assert.equal(missingDates.valid, false);

    // Bad date format rejected
    const badPattern = registry.validateParameters("lifeos.daily_logs.query_range", {
      startDate: "05/01/2026",
      endDate: "2026-05-10",
    });
    assert.equal(badPattern.valid, false);

    // Valid params pass
    const valid = registry.validateParameters("lifeos.schedule.query_occurrences", {
      startDate: "2026-05-01",
      endDate: "2026-05-07",
      limit: 25,
    });
    assert.equal(valid.valid, true);
  });

  it("shares identical schema validation semantics in PlanValidator (allowing $ref)", () => {
    const result = PlanValidator.validate({
      goal: "Read pending tasks and active goals",
      userRequest: "Read pending tasks and active goals",
      steps: [
        {
          stepId: "s1",
          actionType: "lifeos.tasks.query",
          capabilityURN: "lifeos.tasks.query",
          rationale: "Read pending tasks",
          parameters: { status: "pending", limit: 20 },
        },
        {
          stepId: "s2",
          actionType: "lifeos.goals.query",
          capabilityURN: "lifeos.goals.query",
          rationale: "Read active goals",
          parameters: { status: "active", search: "$ref:s1.items[0].title" },
          dependsOn: ["s1"],
        },
      ],
    });
    assert.equal(result.valid, true);
  });

  it("allows concurrent SHARED_READ locks across read steps in ConflictGovernanceEngine", () => {
    const graph = new WorkflowExecutionGraph(
      {
        goal: "Parallel read batch",
        userRequest: "Parallel read batch",
        steps: [
          { stepId: "t1", actionType: "lifeos.tasks.query", capabilityURN: "lifeos.tasks.query", rationale: "r1", parameters: {} },
          { stepId: "t2", actionType: "lifeos.tasks.query", capabilityURN: "lifeos.tasks.query", rationale: "r2", parameters: { status: "completed" } },
        ],
      },
      "wf_reads"
    );

    const readyNodes = graph.getReadyNodes();
    const batch = ConflictGovernanceEngine.selectConcurrentBatch(readyNodes, "user_1", []);
    assert.equal(batch.runnableBatch.length, 2);
    assert.equal(batch.deferredNodes.length, 0);
  });

  it("validates calendar dates, inclusive day counts, pagination clamping, and redaction utilities", () => {
    assert.equal(validateCalendarDate("2026-02-28").valid, true);
    assert.equal(validateCalendarDate("2026-02-30").valid, false);
    assert.equal(calculateInclusiveDayCount("2026-05-01", "2026-05-01"), 1);
    assert.equal(calculateInclusiveDayCount("2026-05-01", "2026-05-31"), 31);
    assert.throws(() => calculateInclusiveDayCount("2026-05-10", "2026-05-01"));

    assert.deepEqual(clampPagination(500, -5, 50, 100, 1000), { limit: 100, offset: 0 });

    const redacted = redactInternalFields({
      _id: "abc",
      title: "Test",
      __v: 3,
      mutationEpoch: 2,
      recentMutationReceipts: ["r1"],
    });
    assert.equal(redacted.__v, undefined);
    assert.equal(redacted.mutationEpoch, undefined);
    assert.equal(redacted.recentMutationReceipts, undefined);
    assert.equal(redacted.title, "Test");

    const summary = buildSanitizedReadAuditSummary("lifeos.daily_logs.query_range", {
      items: [{ reflection: { win: "SECRET_PERSONAL_NOTE" } }],
      totalCount: 1,
      returnedCount: 1,
      hasMore: false,
      emptyReason: "NONE",
    });
    assert.equal(summary._auditSummary, true);
    assert.equal(JSON.stringify(summary).includes("SECRET_PERSONAL_NOTE"), false);
    assert.equal(typeof summary.resultHash, "string");
    assert.equal(summary.resultHash.length, 64);
  });
});
