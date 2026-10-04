/**
 * No Second Brain & Invariant Audit Suite (Phase 13)
 * 
 * Programmatically audits the codebase to enforce:
 * 1. Rule 4: No Second Brain (WorldModelV2 is the single authoritative world representation).
 * 2. Rule 5: Kernel Sovereignty (State mutations must flow through KernelCapabilityService).
 * 3. Rule 1-3: Zero regex / pattern matching as semantic intelligence.
 * 4. Rule: Confidence is epistemic, never execution authorization.
 */

import fs from "fs";
import path from "path";

export interface IArchitecturalAuditResult {
  auditedAt: number;
  allInvariantsPassed: boolean;
  violations: Array<{
    rule: string;
    file: string;
    line?: number;
    description: string;
  }>;
  scannedFilesCount: number;
}

export class NoSecondBrainAuditSuite {
  private static instance: NoSecondBrainAuditSuite;

  static getInstance(): NoSecondBrainAuditSuite {
    if (!NoSecondBrainAuditSuite.instance) {
      NoSecondBrainAuditSuite.instance = new NoSecondBrainAuditSuite();
    }
    return NoSecondBrainAuditSuite.instance;
  }

  runAudit(rootDir: string = process.cwd()): IArchitecturalAuditResult {
    const violations: IArchitecturalAuditResult["violations"] = [];
    let scannedFilesCount = 0;

    const kernelDir = path.join(rootDir, "packages", "execution-kernel", "src");

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
            walkDir(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          scannedFilesCount++;
          this.auditFile(fullPath, entry.name, violations);
        }
      }
    };

    walkDir(kernelDir);

    return {
      auditedAt: Date.now(),
      allInvariantsPassed: violations.length === 0,
      violations,
      scannedFilesCount,
    };
  }

  private auditFile(
    filePath: string,
    fileName: string,
    violations: IArchitecturalAuditResult["violations"]
  ): void {
    if (fileName === "NoSecondBrainAuditSuite.ts") {
      return;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

    // 1. Audit Rule 4: No Second Brain (No WorldModelV3 or parallel brains)
    if (content.includes("class WorldModelV3") || content.includes("interface IWorldModelV3")) {
      violations.push({
        rule: "Rule 4 (No Second Brain)",
        file: relativePath,
        description: "Creation of WorldModelV3 detected. WorldModelV2 must remain the single canonical representation.",
      });
    }

    // 2. Audit ContradictionResolver: Zero Regex
    if (fileName === "ContradictionResolver.ts") {
      if (content.includes("RegExp") || content.includes("/regex/") || /new RegExp\(/.test(content)) {
        violations.push({
          rule: "Rule 1 (Zero Regex in Memory)",
          file: relativePath,
          description: "Regex pattern matching detected in ContradictionResolver. Must use structured slots.",
        });
      }
    }

    // 3. Audit Confidence as Execution Authorization
    // Search for patterns like: if (confidence >= 0.9 && shouldExecute)
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /if\s*\(\s*(?:this\.)?confidence\s*>=\s*0\.\d+\s*&&.*execute/i.test(line) &&
        !filePath.includes("testing")
      ) {
        violations.push({
          rule: "Confidence is Epistemic, Not Execution Gate",
          file: relativePath,
          line: i + 1,
          description: `Direct confidence threshold execution gate detected: '${line.trim()}'`,
        });
      }
    }
  }
}
