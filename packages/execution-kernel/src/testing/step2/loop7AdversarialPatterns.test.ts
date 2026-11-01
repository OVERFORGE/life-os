import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as ts from "typescript";

interface ASTViolation {
  rule: string;
  pattern: string;
  line: number;
}

function analyzeSnippet(code: string): ASTViolation[] {
  const sourceFile = ts.createSourceFile("fixture.ts", code, ts.ScriptTarget.Latest, true);
  const violations: ASTViolation[] = [];

  function visit(node: ts.Node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // Pattern 1: Regex-based intent / action classification
    if (ts.isRegularExpressionLiteral(node)) {
      const regText = node.text.toLowerCase();
      const semanticKeywords = ["task", "goal", "workout", "routine", "complete", "finish", "delete", "schedule"];
      const isSemanticRegex = semanticKeywords.some((kw) => regText.includes(kw));
      // Exclude UUID, ISO date, or non-semantic structural regexes
      const isStructuralRegex =
        regText.includes("[0-9a-f]") ||
        regText.includes("\\d{4}") ||
        regText.includes("^[a-z0-9_-]+$") ||
        regText.includes("urn:");

      if (isSemanticRegex && !isStructuralRegex) {
        violations.push({
          rule: "PROHIBITED_REGEX_INTENT_ROUTER",
          pattern: node.text,
          line,
        });
      }
    }

    // Pattern 2: Keyword-based action selector in conditionals
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (callText.endsWith(".includes") || callText.endsWith(".indexOf") || callText.endsWith(".startsWith")) {
        const args = node.arguments;
        if (args.length > 0 && ts.isStringLiteral(args[0])) {
          const argText = args[0].text.toLowerCase();
          const actionKeywords = ["workout", "routine", "schedule", "class", "task", "habit", "gym"];
          if (actionKeywords.includes(argText)) {
            // Check if this call is inside an if/ternary statement controlling actions
            let parent: ts.Node | undefined = node.parent;
            let isGuardingAction = false;
            while (parent && !isGuardingAction) {
              if (ts.isIfStatement(parent) || ts.isConditionalExpression(parent)) {
                isGuardingAction = true;
              }
              parent = parent.parent;
            }
            if (isGuardingAction) {
              violations.push({
                rule: "PROHIBITED_KEYWORD_ACTION_SELECTOR",
                pattern: node.getText(sourceFile),
                line,
              });
            }
          }
        }
      }
    }

    // Pattern 3: Hardcoded synonym / phrase dictionaries
    if (ts.isObjectLiteralExpression(node)) {
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent)) {
        const varName = parent.name.getText(sourceFile).toLowerCase();
        if (varName.includes("synonym") || varName.includes("phrasemap") || varName.includes("intentdict") || varName.includes("actionmap")) {
          violations.push({
            rule: "PROHIBITED_HARDCODED_SYNONYM_DICTIONARY",
            pattern: parent.name.getText(sourceFile),
            line,
          });
        }
      }
    }

    // Pattern 4: Switch statements mapping natural language to actions
    if (ts.isSwitchStatement(node)) {
      const exprText = node.expression.getText(sourceFile).toLowerCase();
      if (exprText.includes("phrase") || exprText.includes("rawinput") || exprText.includes("usertext") || exprText.includes("message")) {
        violations.push({
          rule: "PROHIBITED_SWITCH_ACTION_CLASSIFIER",
          pattern: node.expression.getText(sourceFile),
          line,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe("Step 2 — Loop 7 Part B: Adversarial Prohibited Patterns Test Battery", () => {
  // Prohibited Pattern 1: Regex-based intent routing
  test("Detects and flags prohibited regex-based intent router", () => {
    const maliciousCode = `
      function classifyUserIntent(rawInput: string) {
        if (/(?:complete|finish|done)\\s+(?:task|todo)/i.test(rawInput)) {
          return "complete_task";
        }
        if (/(?:gym|workout|exercise)/i.test(rawInput)) {
          return "log_workout";
        }
        return "unknown";
      }
    `;

    const violations = analyzeSnippet(maliciousCode);
    assert.ok(violations.length >= 2, "Must detect both regex intent patterns");
    assert.ok(violations.some((v) => v.rule === "PROHIBITED_REGEX_INTENT_ROUTER"));
  });

  // Prohibited Pattern 2: Keyword-based action selector
  test("Detects and flags prohibited keyword action selector in conditional branch", () => {
    const maliciousCode = `
      function selectActionType(userInput: string) {
        if (userInput.includes("workout")) {
          return "health.workout.log";
        } else if (userInput.includes("routine")) {
          return "schedule.routine.execute";
        }
        return "default";
      }
    `;

    const violations = analyzeSnippet(maliciousCode);
    assert.ok(violations.length >= 2, "Must detect keyword action selections");
    assert.ok(violations.some((v) => v.rule === "PROHIBITED_KEYWORD_ACTION_SELECTOR"));
  });

  // Prohibited Pattern 3: Hardcoded synonym dictionary
  test("Detects and flags prohibited hardcoded synonym dictionary", () => {
    const maliciousCode = `
      const intentSynonyms = {
        "wrap up": "complete_task",
        "knock out": "complete_task",
        "done with": "complete_task",
        "file": "create_task"
      };
      function resolveSynonym(word: string) {
        return (intentSynonyms as any)[word];
      }
    `;

    const violations = analyzeSnippet(maliciousCode);
    assert.ok(violations.length >= 1, "Must detect hardcoded synonym dictionary");
    assert.equal(violations[0].rule, "PROHIBITED_HARDCODED_SYNONYM_DICTIONARY");
  });

  // Prohibited Pattern 4: Switch statement mapping natural language to actions
  test("Detects and flags prohibited switch statement classifier on user phrase", () => {
    const maliciousCode = `
      function mapPhraseToAction(rawInput: string) {
        switch (rawInput.toLowerCase().trim()) {
          case "log gym":
            return "health.workout.log";
          case "finish task":
            return "productivity.task.complete";
          default:
            return "noop";
        }
      }
    `;

    const violations = analyzeSnippet(maliciousCode);
    assert.ok(violations.length >= 1, "Must detect switch-based phrase classifier");
    assert.equal(violations[0].rule, "PROHIBITED_SWITCH_ACTION_CLASSIFIER");
  });

  // Positive Fixture 1: Permitted UUID regular expression
  test("Permits deterministic structural validation: UUID format regex", () => {
    const validStructuralCode = `
      export function isValidUUID(id: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
      }
    `;

    const violations = analyzeSnippet(validStructuralCode);
    assert.equal(violations.length, 0, "Structural UUID regex must NOT be flagged as a violation");
  });

  // Positive Fixture 2: Permitted ISO 8601 date regular expression
  test("Permits deterministic structural validation: ISO 8601 date regex", () => {
    const validStructuralCode = `
      export function isValidISODate(dateStr: string): boolean {
        const isoDateRegex = /^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)?$/;
        return isoDateRegex.test(dateStr);
      }
    `;

    const violations = analyzeSnippet(validStructuralCode);
    assert.equal(violations.length, 0, "Structural ISO date regex must NOT be flagged as a violation");
  });

  // Positive Fixture 3: Permitted monotonic version comparison
  test("Permits deterministic monotonic version comparison and projection revision CAS", () => {
    const validVersionCode = `
      export function checkMonotonicity(incomingVersion: number, appliedVersion: number): boolean {
        if (incomingVersion <= appliedVersion) {
          return false; // Stale or duplicate
        }
        return true;
      }
    `;

    const violations = analyzeSnippet(validVersionCode);
    assert.equal(violations.length, 0, "Monotonic version comparison must NOT be flagged");
  });

  // Positive Fixture 4: Permitted JSON Schema / Zod parameter validation
  test("Permits authoritative schema parameter validation via CapabilityRegistry", () => {
    const validValidationCode = `
      export function validateParameters(schema: any, params: Record<string, any>): boolean {
        for (const reqField of schema.required || []) {
          if (params[reqField] === undefined || params[reqField] === null) {
            return false;
          }
        }
        return true;
      }
    `;

    const violations = analyzeSnippet(validValidationCode);
    assert.equal(violations.length, 0, "Structural parameter schema validation must NOT be flagged");
  });
});
