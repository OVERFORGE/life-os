import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import {
  auditSourceFile,
  runArchitecturalAudit,
  ArchitecturalViolation,
} from "../../../../../scripts/verify-semantic-architecture";

describe("Step 3 Loop 7: Semantic Architecture & Rule 9 AST Compliance", () => {
  it("positive fixture: permitted structural syntax regexes produce zero violations", () => {
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/structuralRegexAllowed.fixture.ts"
    );
    const content = fs.readFileSync(fixturePath, "utf8");
    const sourceFile = ts.createSourceFile(
      fixturePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const violations: ArchitecturalViolation[] = [];
    // Audit under delivery tier path simulation
    auditSourceFile(
      sourceFile,
      "packages/execution-kernel/src/events/delivery/SimulatedStructural.ts",
      violations
    );

    assert.equal(
      violations.length,
      0,
      `Expected 0 violations for structural regexes, but found: ${JSON.stringify(violations)}`
    );
  });

  it("negative fixture: prohibited semantic intent regexes trigger Rule 9 violations", () => {
    const fixturePath = path.resolve(
      __dirname,
      "../fixtures/semanticRegexProhibited.fixture.ts"
    );
    const content = fs.readFileSync(fixturePath, "utf8");
    const sourceFile = ts.createSourceFile(
      fixturePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const violations: ArchitecturalViolation[] = [];
    // Audit under delivery tier path simulation
    auditSourceFile(
      sourceFile,
      "packages/execution-kernel/src/events/delivery/SimulatedSemantic.ts",
      violations
    );

    assert.ok(
      violations.length >= 3,
      `Expected at least 3 Rule 9 violations, but got ${violations.length}`
    );

    const rule9Violations = violations.filter(
      (v) => v.ruleId === "ARCH-DELIVERY-NO-SEMANTIC-PARSING"
    );
    assert.equal(
      rule9Violations.length,
      violations.length,
      "All reported violations must be ARCH-DELIVERY-NO-SEMANTIC-PARSING"
    );
  });

  it("repository-wide audit: all source files strictly satisfy all 9 rules with 0 violations", () => {
    const violations = runArchitecturalAudit();
    assert.equal(
      violations.length,
      0,
      `Expected 0 repository-wide architectural violations, but found ${violations.length}`
    );
  });
});

