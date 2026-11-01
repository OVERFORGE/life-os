import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..", "..");

const MUTATION_METHODS = new Set([
  "create",
  "insertOne",
  "insertMany",
  "save",
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findByIdAndDelete",
  "bulkWrite"
]);

interface DiscoveredMutation {
  file: string;
  line: number;
  method: string;
  expression: string;
  caller: string;
}

const discovered: DiscoveredMutation[] = [];

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
        entry.name === "tests" ||
        entry.name === "legacy-fixtures"
      ) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".tsx"))) {
      const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
      scanFile(fullPath, relPath);
    }
  }
}

function scanFile(filePath: string, relPath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      let methodName = "";
      let callerName = "";

      if (ts.isPropertyAccessExpression(expr)) {
        methodName = expr.name.text;
        callerName = expr.expression.getText(sourceFile);
      }

      if (MUTATION_METHODS.has(methodName)) {
        // Exclude common false positives: Object.create, document.createElement, etc.
        if (callerName === "Object" || callerName === "document" || callerName === "React" || callerName === "crypto") {
          return;
        }

        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        discovered.push({
          file: relPath,
          line,
          method: methodName,
          expression: node.getText(sourceFile).replace(/\r?\n\s*/g, " ").slice(0, 140),
          caller: callerName
        });
      }
    }

    if (ts.isStringLiteral(node)) {
      if (node.text === "$merge" || node.text === "$out") {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        discovered.push({
          file: relPath,
          line,
          method: node.text,
          expression: node.parent ? node.parent.getText(sourceFile).replace(/\r?\n\s*/g, " ").slice(0, 140) : node.text,
          caller: "aggregation"
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

console.log("Scanning workspace from:", ROOT_DIR);
scanDirectory(path.join(ROOT_DIR, "apps"));
scanDirectory(path.join(ROOT_DIR, "packages"));

const outputPath = path.join(__dirname, "discovered_mutations.json");
fs.writeFileSync(outputPath, JSON.stringify(discovered, null, 2), "utf8");

console.log(`Scan completed. Discovered ${discovered.length} mutation method call sites across apps/ and packages/.`);
console.log(`Saved results to: ${outputPath}`);
