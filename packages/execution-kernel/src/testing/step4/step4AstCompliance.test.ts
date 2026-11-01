/**
 * step4AstCompliance.test.ts
 * 
 * Step 4 Loop 7: Semantic Architecture & Rule 9 AST Compliance Battery
 * 
 * Verification Battery:
 * 1. Positive Fixture: Structural regexes (UUID, ISO-8601, Bearer, email, digits) pass AST audit with 0 violations.
 * 2. Negative Fixture: Semantic action/state intent regexes trigger exact RULE 9 violation codes.
 * 3. Full Repository Audit: Audits all production TypeScript files across the monorepo to guarantee 0 violations.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { auditSourceFile, ArchitecturalViolation } from "../../../../../scripts/verify-semantic-architecture";

describe("Step 4 Loop 7: Semantic Architecture Rule 9 AST Compliance", () => {
  const fixturesDir = path.resolve(__dirname, "../fixtures");

  it("1. Positive Fixture: Structural regexes pass AST scan with 0 violations", () => {
    const fixturePath = path.join(fixturesDir, "structuralRegexAllowed.fixture.ts");
    assert.ok(fs.existsSync(fixturePath), `Fixture missing at ${fixturePath}`);

    const content = fs.readFileSync(fixturePath, "utf8");
    const sourceFile = ts.createSourceFile(
      fixturePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const violations: ArchitecturalViolation[] = [];
    // Test under delivery tier path scope
    auditSourceFile(sourceFile, "execution-kernel/src/events/delivery/structuralRegex.ts", violations);

    assert.equal(violations.length, 0, `Expected 0 violations for structural regexes, but got: ${JSON.stringify(violations)}`);
  });

  it("2. Negative Fixture: Semantic intent regexes trigger exact RULE 9 violation codes", () => {
    const fixturePath = path.join(fixturesDir, "semanticRegexProhibited.fixture.ts");
    assert.ok(fs.existsSync(fixturePath), `Fixture missing at ${fixturePath}`);

    const content = fs.readFileSync(fixturePath, "utf8");
    const sourceFile = ts.createSourceFile(
      fixturePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const violations: ArchitecturalViolation[] = [];
    // Test under delivery tier path scope
    auditSourceFile(sourceFile, "execution-kernel/src/events/delivery/semanticRegex.ts", violations);

    // Assert that violations were flagged
    assert.ok(violations.length > 0, "Expected violations to be flagged for semantic regex fixture");
    const hasRule9 = violations.some((v) => v.ruleId === "ARCH-DELIVERY-NO-SEMANTIC-PARSING");
    assert.ok(hasRule9, "Expected ARCH-DELIVERY-NO-SEMANTIC-PARSING (Rule 9) violation to be flagged");
  });

  it("3. Repository Audit: Confirms 0 architectural violations across all production source files", () => {
    const rootDir = path.resolve(__dirname, "../../../../../");
    const auditDirs = [
      path.join(rootDir, "packages", "execution-kernel", "src"),
      path.join(rootDir, "apps", "web", "server"),
      path.join(rootDir, "apps", "web", "app", "api"),
    ];

    const violations: ArchitecturalViolation[] = [];
    let filesAudited = 0;

    function walkDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "dist") {
            walkDir(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          if (!fullPath.includes(".fixture.") && !fullPath.includes(".test.")) {
            const content = fs.readFileSync(fullPath, "utf8");
            const sourceFile = ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true);
            auditSourceFile(sourceFile, fullPath, violations);
            filesAudited++;
          }
        }
      }
    }

    for (const d of auditDirs) {
      walkDir(d);
    }

    assert.ok(filesAudited > 100, `Expected > 100 files audited, got ${filesAudited}`);
    assert.equal(violations.length, 0, `Expected 0 violations across production files, got ${violations.length}: ${JSON.stringify(violations)}`);
  });
});
