import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..");

interface Finding {
  category: "REGEX" | "KEYWORD_SUBSTRING" | "HARDCODING" | "SILENT_FALLBACK";
  file: string;
  line: number;
  snippet: string;
  description: string;
  prohibited: boolean;
  notes: string;
}

const findings: Finding[] = [];

function scanDirectory(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".git" ||
        entry.name === ".turbo" ||
        entry.name === "testing" ||
        entry.name === "legacy-fixtures"
      ) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
      scanFile(fullPath, relPath);
    }
  }
}

function scanFile(filePath: string, relPath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  // Check if file is in intelligence or orchestration or dispatch
  const isOrchestrationOrDispatch =
    relPath.includes("orchestration/") ||
    relPath.includes("dispatch/") ||
    relPath.includes("apps/web/app/api/");

  function visit(node: ts.Node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // 1. Regex Literals
    if (ts.isRegularExpressionLiteral(node)) {
      const regexText = node.text;
      // Distinguish syntactic validation (e.g. UUID, ISO date, email, digits) from semantic intent regex
      const isDateOrUuid =
        /^\/\\d|iso|uuid|date|email|url|\^\d|\b0x/i.test(regexText) ||
        regexText.includes("\\d{4}-\\d{2}-\\d{2}") ||
        regexText.includes("^[0-9a-fA-F]{24}$");

      const isSemanticIntent =
        /intent|task|goal|workout|gym|routine|schedule|create|delete|update|remove|cancel/i.test(regexText) &&
        !isDateOrUuid;

      if (isSemanticIntent && isOrchestrationOrDispatch) {
        findings.push({
          category: "REGEX",
          file: relPath,
          line,
          snippet: regexText,
          description: "Regex pattern matching action/domain terms in orchestration/dispatch",
          prohibited: true,
          notes: "Potential regex-based semantic routing or action detection."
        });
      } else if (!isDateOrUuid && isOrchestrationOrDispatch) {
        findings.push({
          category: "REGEX",
          file: relPath,
          line,
          snippet: regexText,
          description: "Non-syntax regex literal in orchestration/dispatch",
          prohibited: false,
          notes: "Review for semantic vs syntactic validation."
        });
      }
    }

    // 2. Keyword/substring checks on natural language inputs
    if (ts.isCallExpression(node)) {
      const text = node.getText(sourceFile);
      if (
        (text.includes(".toLowerCase().includes(") ||
         text.includes(".includes(") ||
         text.includes(".startsWith(") ||
         text.includes(".indexOf(")) &&
        isOrchestrationOrDispatch
      ) {
        // Check what variable is being checked: input, message, text, query, prompt
        if (
          /\b(input|message|text|query|content|utterance|str)\.toLowerCase\(\)\.(includes|startsWith|indexOf)/.test(text)
        ) {
          findings.push({
            category: "KEYWORD_SUBSTRING",
            file: relPath,
            line,
            snippet: text.slice(0, 120),
            description: "Keyword/substring check directly against natural language input variable",
            prohibited: true,
            notes: "Natural language input parsed via substring rather than intelligence layer."
          });
        }
      }
    }

    // 3. Silent fallbacks / rejections: returning null or substituting default without explanation
    if (ts.isReturnStatement(node) && isOrchestrationOrDispatch) {
      const returnExpr = node.expression;
      if (returnExpr && ts.isObjectLiteralExpression(returnExpr)) {
        const text = returnExpr.getText(sourceFile);
        if (text.includes("fallback") || text.includes("UNKNOWN") || text.includes("null")) {
          // Check if it's dynamic planner or supervisor fallback
          if (relPath.includes("DynamicWorkflowPlanner") && text.includes("generateDeterministicFallback")) {
            findings.push({
              category: "SILENT_FALLBACK",
              file: relPath,
              line,
              snippet: text.slice(0, 120),
              description: "Deterministic fallback in DynamicWorkflowPlanner",
              prohibited: false,
              notes: "Must verify environment check throws in production (Rule 5)."
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

scanDirectory(path.join(ROOT_DIR, "packages", "execution-kernel", "src"));
scanDirectory(path.join(ROOT_DIR, "apps", "web", "app", "api"));

console.log(`Semantic audit scan complete. Found ${findings.length} findings.`);
fs.writeFileSync(
  path.join(__dirname, "semantic_audit_findings.json"),
  JSON.stringify(findings, null, 2),
  "utf8"
);

