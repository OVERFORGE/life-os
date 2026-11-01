import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

export interface ArchitecturalViolation {
  ruleId: string;
  file: string;
  line: number;
  message: string;
}

export interface ArchitecturalException {
  ruleId: string;
  file: string;
  startLine: number;
  endLine: number;
  approvedUntil: string;
  rationale: string;
  approvedBy: string;
}

const VIOLATIONS: ArchitecturalViolation[] = [];
const ROOT_DIR = path.resolve(__dirname, "..");
const AUDIT_DIRS = [
  path.join(ROOT_DIR, "packages", "execution-kernel", "src"),
  path.join(ROOT_DIR, "apps", "web", "app", "api"),
  path.join(ROOT_DIR, "apps", "web", "features"),
  path.join(ROOT_DIR, "apps", "web", "server"),
  path.join(ROOT_DIR, "apps", "web", "components"),
  path.join(ROOT_DIR, "apps", "web", "hooks"),
];

// Load and validate exceptions file if present
const EXEMPTIONS_FILE = path.join(ROOT_DIR, ".architectural-exceptions.json");
let EXEMPTIONS: ArchitecturalException[] = [];

if (fs.existsSync(EXEMPTIONS_FILE)) {
  try {
    const raw = fs.readFileSync(EXEMPTIONS_FILE, "utf8").trim();
    if (raw.length > 0) {
      EXEMPTIONS = JSON.parse(raw);
      if (!Array.isArray(EXEMPTIONS)) {
        throw new Error(".architectural-exceptions.json must contain a JSON array.");
      }
      if (EXEMPTIONS.length > 5) {
        VIOLATIONS.push({
          ruleId: "ARCH-GOVERNANCE-EXCEPTIONS",
          file: ".architectural-exceptions.json",
          line: 1,
          message: `Exceptions file contains ${EXEMPTIONS.length} entries. Maximum allowed is 5.`
        });
      }
      const now = Date.now();
      for (const [idx, ex] of EXEMPTIONS.entries()) {
        const approvalDate = new Date(ex.approvedUntil).getTime();
        if (isNaN(approvalDate)) {
          VIOLATIONS.push({
            ruleId: "ARCH-GOVERNANCE-EXCEPTIONS",
            file: ".architectural-exceptions.json",
            line: idx + 1,
            message: `Invalid approvedUntil timestamp in exception for rule '${ex.ruleId}'.`
          });
        } else if (approvalDate < now) {
          VIOLATIONS.push({
            ruleId: "ARCH-GOVERNANCE-EXCEPTIONS",
            file: ".architectural-exceptions.json",
            line: idx + 1,
            message: `Exception for rule '${ex.ruleId}' in file '${ex.file}' expired on ${ex.approvedUntil}.`
          });
        }
      }
    }
  } catch (err: any) {
    VIOLATIONS.push({
      ruleId: "ARCH-GOVERNANCE-EXCEPTIONS",
      file: ".architectural-exceptions.json",
      line: 1,
      message: `Failed to parse .architectural-exceptions.json: ${err.message}`
    });
  }
}

export function isExempt(ruleId: string, file: string, line: number): boolean {
  const normalizedFile = file.replace(/\\/g, "/");
  return EXEMPTIONS.some((ex: ArchitecturalException) => {
    if (ex.ruleId !== ruleId) return false;
    const targetExFile = ex.file.replace(/\\/g, "/");
    const matchesFile = normalizedFile.endsWith(targetExFile) || normalizedFile === targetExFile;
    const withinLines = line >= ex.startLine && line <= ex.endLine;
    const notExpired = new Date(ex.approvedUntil).getTime() > Date.now();
    return matchesFile && withinLines && notExpired;
  });
}

export function auditSourceFile(
  sourceFile: ts.SourceFile,
  filePath: string,
  violationsList: ArchitecturalViolation[] = VIOLATIONS
) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const isSupervisor = normalizedPath.endsWith("orchestration/supervisor/Supervisor.ts");
  const isPlanner = normalizedPath.endsWith("orchestration/planning/DynamicWorkflowPlanner.ts");
  const isOrchestration = normalizedPath.includes("execution-kernel/src/orchestration/");
  const isDispatchOrApi = (normalizedPath.includes("execution-kernel/src/dispatch/") || normalizedPath.includes("apps/web/app/api/")) && !normalizedPath.includes("/testing/");
  const isAutonomousOrTemporal = (normalizedPath.includes("execution-kernel/src/autonomous/strategies/") || normalizedPath.includes("execution-kernel/src/temporal/")) && !normalizedPath.includes("/testing/");
  const isProductionKernel = normalizedPath.includes("execution-kernel/src/") && !normalizedPath.includes("/testing/");
  const isDeliveryTier = (
    normalizedPath.includes("execution-kernel/src/events/delivery/") ||
    normalizedPath.includes("execution-kernel/src/events/contracts/DeliveryContracts") ||
    normalizedPath.includes("apps/web/server/services/SSEConnectionManager") ||
    normalizedPath.includes("apps/web/app/api/surface/events/") ||
    normalizedPath.includes("apps/mobile/services/InteractionEventTransport")
  ) && !normalizedPath.includes("/testing/");

  function visit(node: ts.Node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // RULE 1: Restricted Supervisor Imports
    if (isSupervisor && ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      const isAllowed =
        moduleSpecifier.startsWith("../contracts/") ||
        moduleSpecifier.startsWith("./") ||
        moduleSpecifier.startsWith("../semantic/") ||
        moduleSpecifier.startsWith("../context/") ||
        moduleSpecifier.startsWith("../planning/") ||
        moduleSpecifier.startsWith("../capabilities/") ||
        moduleSpecifier.startsWith("../kernel/") ||
        moduleSpecifier.startsWith("../events/") ||
        moduleSpecifier.startsWith("../react/") ||
        moduleSpecifier.startsWith("../workspace/") ||
        moduleSpecifier.startsWith("../observability/") ||
        moduleSpecifier.startsWith("../external/") ||
        moduleSpecifier.startsWith("../../shared/") ||
        moduleSpecifier.startsWith("../../kernel/") ||
        moduleSpecifier.startsWith("../../persona") ||
        moduleSpecifier.startsWith("../../worldv2/") ||
        moduleSpecifier.startsWith("node:") ||
        moduleSpecifier === "zod" ||
        moduleSpecifier === "mongoose";

      const isForbidden =
        moduleSpecifier.includes("FastPathExecutor") ||
        moduleSpecifier.includes("toolRouter") ||
        moduleSpecifier.includes("intentRouter") ||
        moduleSpecifier.endsWith("/intentModel") ||
        moduleSpecifier === "./intentModel";

      if (!isAllowed || isForbidden) {
        if (!isExempt("ARCH-BOUNDARY-SUPERVISOR", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-BOUNDARY-SUPERVISOR",
            file: normalizedPath,
            line,
            message: `Supervisor import boundary violation: '${moduleSpecifier}' is prohibited.`
          });
        }
      }
    }

    // RULE 2: Prose Keyword Action Coercion
    if (isSupervisor && (ts.isCallExpression(node) || ts.isBinaryExpression(node))) {
      const callText = node.getText(sourceFile);
      const isCoercionCall =
        callText.includes(".includes(") ||
        callText.includes(".indexOf(") ||
        callText.includes(".match(") ||
        callText.includes(".test(");
      const hasKeywords =
        callText.includes('"class"') ||
        callText.includes('"schedule"') ||
        callText.includes('"block"') ||
        callText.includes('"routine"') ||
        callText.includes('"workout"') ||
        callText.includes('"task"') ||
        callText.includes("'class'") ||
        callText.includes("'schedule'") ||
        callText.includes("'block'") ||
        callText.includes("'routine'") ||
        callText.includes("'workout'") ||
        callText.includes("'task'");
      if (isCoercionCall && hasKeywords) {
        if (!isExempt("ARCH-BEHAVIOR-PROSE", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-BEHAVIOR-PROSE",
            file: normalizedPath,
            line,
            message: "Prose keyword action coercion detected. Assistant response text must not alter actionType."
          });
        }
      }
    }

    // RULE 3: Hardcoded Capability String Whitelists
    if (isSupervisor && (ts.isBinaryExpression(node) || ts.isCallExpression(node))) {
      const text = node.getText(sourceFile);
      if (text.includes("capURN.includes") || text.includes("actionType.includes")) {
        if (!isExempt("ARCH-AUTHORITY-CAPABILITY", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-AUTHORITY-CAPABILITY",
            file: normalizedPath,
            line,
            message: "Hardcoded capability string check detected. Must query CapabilityRegistry.getCapability()."
          });
        }
      }
    }

    // RULE 4: Non-Deterministic Idempotency Keys
    if (isOrchestration) {
      if (ts.isPropertyAssignment(node)) {
        const propName = node.name.getText(sourceFile);
        if (propName === "idempotencyKey" || propName === '"idempotencyKey"') {
          const initText = node.initializer.getText(sourceFile);
          if (initText.includes("Date.now()") || initText.includes("Math.random()")) {
            if (!isExempt("ARCH-INVARIANT-IDEMPOTENCY", normalizedPath, line)) {
              violationsList.push({
                ruleId: "ARCH-INVARIANT-IDEMPOTENCY",
                file: normalizedPath,
                line,
                message: "Idempotency key derives from dynamic clock or random generator. Must derive deterministically."
              });
            }
          }
        }
      } else if (ts.isBinaryExpression(node)) {
        const leftText = node.left.getText(sourceFile);
        if (leftText.endsWith("idempotencyKey") || leftText === "idempotencyKey") {
          const rightText = node.right.getText(sourceFile);
          if (rightText.includes("Date.now()") || rightText.includes("Math.random()")) {
            if (!isExempt("ARCH-INVARIANT-IDEMPOTENCY", normalizedPath, line)) {
              violationsList.push({
                ruleId: "ARCH-INVARIANT-IDEMPOTENCY",
                file: normalizedPath,
                line,
                message: "Idempotency key derives from dynamic clock or random generator. Must derive deterministically."
              });
            }
          }
        }
      } else if (ts.isVariableDeclaration(node)) {
        const varName = node.name.getText(sourceFile);
        if (varName === "idempotencyKey") {
          const initText = node.initializer?.getText(sourceFile) || "";
          if (initText.includes("Date.now()") || initText.includes("Math.random()")) {
            if (!isExempt("ARCH-INVARIANT-IDEMPOTENCY", normalizedPath, line)) {
              violationsList.push({
                ruleId: "ARCH-INVARIANT-IDEMPOTENCY",
                file: normalizedPath,
                line,
                message: "Idempotency key derives from dynamic clock or random generator. Must derive deterministically."
              });
            }
          }
        }
      }
    }

    // RULE 5: Production Benchmark Plan Fallback
    if (isPlanner && ts.isMethodDeclaration(node)) {
      const methodName = node.name.getText(sourceFile);
      if (methodName === "generateDeterministicFallback") {
        const bodyText = node.body ? node.body.getText(sourceFile) : "";
        if (!bodyText.includes("process.env.NODE_ENV") || !bodyText.includes("throw")) {
          if (!isExempt("ARCH-INTELLIGENCE-PLANNING", normalizedPath, line)) {
            violationsList.push({
              ruleId: "ARCH-INTELLIGENCE-PLANNING",
              file: normalizedPath,
              line,
              message: "DynamicWorkflowPlanner.generateDeterministicFallback must throw in production environment."
            });
          }
        }
      }
    }

    // RULE 6: Deprecated Intent Router Imports
    if (isProductionKernel && ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      const isLegacyIntent =
        moduleSpecifier.includes("toolRouter") ||
        moduleSpecifier.includes("intentRouter") ||
        moduleSpecifier.endsWith("/intentModel") ||
        moduleSpecifier === "./intentModel";
      if (isLegacyIntent) {
        if (!isExempt("ARCH-LEGACY-ISOLATION", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-LEGACY-ISOLATION",
            file: normalizedPath,
            line,
            message: `Import of deprecated legacy router '${moduleSpecifier}' is barred from production paths.`
          });
        }
      }
    }

    // RULE 7: Local System Timezone Leakage
    if (isAutonomousOrTemporal && ts.isCallExpression(node)) {
      const text = node.getText(sourceFile);
      if (
        (/\.(getHours|getDay|getDate)\s*\(\)/.test(text) && !text.includes("getUTC")) ||
        text.includes("new Date().getHours()") ||
        text.includes("new Date().getDay()") ||
        text.includes("now.getHours()") ||
        text.includes("now.getDay()")
      ) {
        if (!isExempt("ARCH-INVARIANT-CLOCK", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-INVARIANT-CLOCK",
            file: normalizedPath,
            line,
            message: "Host system clock inspected without user timezone conversion. Use user.timezone context."
          });
        }
      }
    }

    // RULE 8: Secondary Intent Classification Outside Interpreter
    if (isDispatchOrApi && (ts.isRegularExpressionLiteral(node) || ts.isCallExpression(node))) {
      const text = node.getText(sourceFile);
      if (
        text.includes("intentClassifier") ||
        (text.includes(".match(") && text.includes("request.body"))
      ) {
        if (!isExempt("ARCH-BOUNDARY-DISPATCH", normalizedPath, line)) {
          violationsList.push({
            ruleId: "ARCH-BOUNDARY-DISPATCH",
            file: normalizedPath,
            line,
            message: "Secondary natural language intent classification detected in dispatch/API layer."
          });
        }
      }
    }

    // RULE 9: Delivery Tier Semantic Parsing Prohibition
    if (isDeliveryTier && (ts.isRegularExpressionLiteral(node) || ts.isNewExpression(node))) {
      let pattern = "";
      if (ts.isRegularExpressionLiteral(node)) {
        pattern = node.getText(sourceFile);
      } else if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === "RegExp") {
        pattern = node.arguments?.[0]?.getText(sourceFile) || "";
      }

      if (pattern) {
        const hasActionIntents =
          /\b(create|update|delete|cancel)\b/i.test(pattern) &&
          /\b(task|goal|session|event|workout)\b/i.test(pattern);
        const hasStateGuessing = /\b(done|finished|completed|closed)\b/i.test(pattern);
        const hasUrgencyGuessing = /\b(urgent|critical|high priority|asap)\b/i.test(pattern);

        if (hasActionIntents || hasStateGuessing || hasUrgencyGuessing) {
          if (!isExempt("ARCH-DELIVERY-NO-SEMANTIC-PARSING", normalizedPath, line)) {
            violationsList.push({
              ruleId: "ARCH-DELIVERY-NO-SEMANTIC-PARSING",
              file: normalizedPath,
              line,
              message: `Rule 9 violation: Semantic intent regex or action keyword matching detected in delivery tier: ${pattern}`
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function collectSourceFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".git"
      ) {
        continue;
      }
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(fullPath);
    }
  }

  return results;
}

export function runArchitecturalAudit(): ArchitecturalViolation[] {
  const fileSet = new Set<string>();
  for (const dir of AUDIT_DIRS) {
    for (const f of collectSourceFiles(dir)) {
      fileSet.add(f);
    }
  }
  const filesToAudit = Array.from(fileSet);

  console.log(`[ARCH-LINTER] Auditing ${filesToAudit.length} TypeScript source files...`);

  for (const filePath of filesToAudit) {
    const content = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    auditSourceFile(sourceFile, filePath);
  }

  return VIOLATIONS;
}

// Execution Entrypoint
if (require.main === module || (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("verify-semantic-architecture.ts"))) {
  const violations = runArchitecturalAudit();

  console.log("\n=======================================================");
  console.log("       LIFEOS SEMANTIC ARCHITECTURE AUDIT REPORT       ");
  console.log("=======================================================");

  if (violations.length === 0) {
    console.log("SUCCESS: 0 architectural violations found.");
    console.log("All 9 Semantic Architecture Rules verified and compliant.");
    console.log("=======================================================\n");
    process.exit(0);
  } else {
    console.error(`FAILURE: Detected ${violations.length} architectural violation(s):\n`);
    for (const [idx, v] of violations.entries()) {
      console.error(`[${idx + 1}] Rule: ${v.ruleId}`);
      console.error(`    File: ${v.file}:${v.line}`);
      console.error(`    Details: ${v.message}\n`);
    }
    console.error("=======================================================\n");
    process.exit(1);
  }
}
