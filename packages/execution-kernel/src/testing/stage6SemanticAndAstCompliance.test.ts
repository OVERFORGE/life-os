import test from "node:test";
import assert from "node:assert/strict";
import * as ts from "typescript";
import { OutcomeVerifier } from "../orchestration/kernel/OutcomeVerifier";
import { DynamicWorkflowPlanner } from "../orchestration/planning/DynamicWorkflowPlanner";
import { CapabilityRegistry } from "../orchestration/capabilities/CapabilityRegistry";
import { auditSourceFile, ArchitecturalViolation } from "../../../../scripts/verify-semantic-architecture";

test("Stage 6.3: Semantic 2.3 Compliance & Expanded AST Rules (10-14)", async (t) => {
  await t.test("6.3a: OutcomeVerifier enforces structured NO_RESCHEDULE_ENTITY without English regexes", () => {
    const pre: any = {
      userId: "u1",
      timestamp: 1,
      graphSnapshot: {
        nodeCount: 1,
        cycleDiagnostics: [],
        readyNodes: [{ id: "t_1", title: "Submit Thesis", metadata: { dueDate: "2026-11-26" } }],
      },
      worldSnapshot: { executionGraphSummary: { stabilityScore: 90 } },
    };
    const post: any = {
      userId: "u1",
      timestamp: 2,
      graphSnapshot: {
        nodeCount: 1,
        cycleDiagnostics: [],
        readyNodes: [{ id: "t_1", title: "Submit Thesis", metadata: { dueDate: "2026-11-27" } }],
      },
      worldSnapshot: { executionGraphSummary: { stabilityScore: 90 } },
    };

    const res = OutcomeVerifier.verify(
      [{ kind: "NO_RESCHEDULE_ENTITY", entityId: "t_1", entityTitle: "Submit Thesis" }],
      pre,
      post
    );
    assert.equal(res.allHardInvariantsPassed, false);
    assert.match(res.failedInvariants[0], /CONSTRAINT_VIOLATED/);
  });

  await t.test("6.3b: DynamicWorkflowPlanner fails closed when LLM is unavailable (no keyword fallback)", async () => {
    const planner = new DynamicWorkflowPlanner({
      registry: CapabilityRegistry.getInstance(),
      allowBenchmarkFallback: true,
    });
    await assert.rejects(
      async () => {
        await planner.planWorkflow({
          userRequest: "Search emails, summarize updates, and write file briefing.md",
          goal: "Email summary",
        });
      },
      (err: any) => err.message.includes("[PLANNING_FAILED]")
    );
  });

  await t.test("6.3c: Expanded AST Rules 10-14 detect synthetic violations accurately", () => {
    const check = (virtualPath: string, code: string): ArchitecturalViolation[] => {
      const sf = ts.createSourceFile(virtualPath, code, ts.ScriptTarget.Latest, true);
      const list: ArchitecturalViolation[] = [];
      auditSourceFile(sf, virtualPath, list);
      return list;
    };

    // Rule 10
    const r10 = check(
      "packages/execution-kernel/src/orchestration/supervisor/index.ts",
      `export * from "./FastPathExecutor";`
    );
    assert.ok(r10.some((v) => v.ruleId === "NO_LEGACY_FAST_PATH_IMPORT"));

    // Rule 11
    const r11 = check(
      "packages/execution-kernel/src/dispatch/executionHandlers/handleConfirmGoal.ts",
      `export function f(s: string) { return /change|modify/i.test(s); }`
    );
    assert.ok(r11.some((v) => v.ruleId === "NO_PLANNER_VERIFIER_HANDLER_REGEX"));

    // Rule 12
    const r12 = check(
      "packages/execution-kernel/src/orchestration/context/ContextProjectionEngine.ts",
      `export function proj(m: any) { return m.mood ?? 5; }`
    );
    assert.ok(r12.some((v) => v.ruleId === "NO_FABRICATED_CONTEXT_PROJECTION_DEFAULTS"));

    // Rule 13
    const r13 = check(
      "apps/web/app/api/test/route.ts",
      `export async function GET() { const u = await User.findOne(); return u; }`
    );
    assert.ok(r13.some((v) => v.ruleId === "API_AUTH_AND_TENANT_GUARD"));

    // Rule 14
    const r14 = check(
      "apps/web/app/api/test/route.ts",
      `export async function POST() { return FoodItem.create({ name: "Apple" }); }`
    );
    assert.ok(r14.some((v) => v.ruleId === "API_AND_HANDLER_OUTBOX_PARITY"));
  });
});
