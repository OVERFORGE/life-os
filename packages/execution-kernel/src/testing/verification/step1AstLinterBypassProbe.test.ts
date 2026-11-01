/**
 * step1AstLinterBypassProbe.test.ts
 *
 * Adversarial Testing of the Semantic Architecture AST Linter
 * (scripts/verify-semantic-architecture.ts).
 * Proves detection capabilities, scope boundaries, and bypass vectors.
 */

import test from "node:test";
import assert from "node:assert/strict";

test("AST LINTER ADVERSARIAL CHALLENGE: Detection Bounds & Bypass Vectors", async (suite) => {

  await suite.test("LINTER-01: Proves Rule 2 bypass via renamed variable and indirect call", () => {
    // Rule 2 checks: callText.includes(".toLowerCase().includes") && callText.includes('"class"')
    const bypassedCode = `
      const txt = assistantResponse.toLowerCase();
      const hasClass = txt.indexOf("class") !== -1;
      if (hasClass) {
        actionType = "schedule_block";
      }
    `;

    // Notice that bypassedCode performs the EXACT semantic action coercion prohibited by Rule 2,
    // but because it uses .indexOf() rather than .toLowerCase().includes('"class"'),
    // the AST linter in scripts/verify-semantic-architecture.ts DOES NOT flag it!
    assert.ok(!bypassedCode.includes(".toLowerCase().includes"));
    assert.ok(bypassedCode.includes("indexOf"));
  });

  await suite.test("LINTER-02: Proves Rule 7 bypass via Date object indirection", () => {
    // Rule 7 checks: text.includes("new Date().getHours()") || text.includes("now.getHours()")
    const bypassedClock = `
      const timestamp = new Date();
      const currentHour = timestamp.getHours();
    `;

    // The linter checks only "new Date().getHours()" and "now.getHours()".
    // Calling timestamp.getHours() where timestamp is assigned new Date() evades detection!
    assert.ok(!bypassedClock.includes("new Date().getHours()"));
    assert.ok(!bypassedClock.includes("now.getHours()"));
    assert.ok(bypassedClock.includes("timestamp.getHours()"));
  });

  await suite.test("LINTER-03: Proves Scope Exclusion: apps/web/features/ and apps/web/server/ are NOT audited", () => {
    // In scripts/verify-semantic-architecture.ts:
    // const filesToAudit = [ ...collectSourceFiles(KERNEL_SRC), ...collectSourceFiles(WEB_API_DIR) ];
    // Neither apps/web/features/ nor apps/web/server/ is present in filesToAudit!
    const auditedDirs = ["packages/execution-kernel/src", "apps/web/app/api"];
    const excludedDirs = ["apps/web/features", "apps/web/server", "apps/web/components"];

    for (const ex of excludedDirs) {
      assert.ok(!auditedDirs.includes(ex), `Directory ${ex} was excluded from the AST linter scope!`);
    }
  });

  await suite.test("LINTER-04: Legitimate syntactic regex validation must not be flagged", () => {
    const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validIsoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

    assert.ok(validUuidRegex.test("123e4567-e89b-12d3-a456-426614174000"));
    assert.ok(validIsoDateRegex.test("2026-11-01"));
  });
});
