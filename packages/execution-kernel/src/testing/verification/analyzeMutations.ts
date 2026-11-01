import * as fs from "fs";
import * as path from "path";

interface MutationEntry {
  file: string;
  line: number;
  method: string;
  expression: string;
  caller: string;
}

const raw: MutationEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "discovered_mutations.json"), "utf8")
);

interface AnalyzedEntry extends MutationEntry {
  category: "COMPLIANT" | "NON-COMPLIANT" | "INTENTIONALLY EXEMPT" | "UNREACHABLE LEGACY" | "UNVERIFIED";
  classificationReason: string;
  aggregate: string;
  isStep1Target: boolean;
}

const analyzed: AnalyzedEntry[] = [];

for (const entry of raw) {
  const { file, line, method, expression, caller } = entry;
  let category: AnalyzedEntry["category"] = "UNVERIFIED";
  let reason = "";
  let aggregate = "Unknown";
  let isStep1Target = false;

  // Determine aggregate based on caller, file path, or expression
  if (caller.includes("Goal") || file.includes("goal")) {
    aggregate = "Goal";
  } else if (caller.includes("Task") || file.includes("task")) {
    aggregate = "Task";
  } else if (caller.includes("Workout") || file.includes("gym") || file.includes("workout")) {
    aggregate = "WorkoutSession";
  } else if (caller.includes("Temporal") || file.includes("temporal") || caller.includes("Occurrence")) {
    aggregate = "TemporalOccurrence";
  } else if (caller.includes("DailyLog") || file.includes("DailyLog") || file.includes("signals")) {
    aggregate = "DailyLog";
  } else if (caller.includes("Outbox") || caller.includes("Receipt") || file.includes("events/persistence")) {
    aggregate = "Outbox/Receipt Infrastructure";
  } else if (file.includes("models/") || file.includes("server/db/")) {
    aggregate = "Model/Schema Definition";
  } else if (caller.includes("User") || file.includes("user")) {
    aggregate = "User";
  } else {
    aggregate = caller || "Other";
  }

  // Check if it's one of the Step 1 core aggregates: Goal, Task, WorkoutSession, TemporalOccurrence, DailyLog
  if (["Goal", "Task", "WorkoutSession", "TemporalOccurrence", "DailyLog"].includes(aggregate)) {
    isStep1Target = true;
  }

  // Classification logic:
  // 1. Domain engines (goalEngine, taskEngine, gymEngine, OutboxStorageService)
  if (
    file.includes("features/goals/engine/goalEngine.ts") ||
    file.includes("features/tasks/engine/taskEngine.ts") ||
    file.includes("features/gym/engine/gymEngine.ts") ||
    file.includes("events/persistence/OutboxStorageService.ts") ||
    file.includes("orchestration/workspace/ExecutionPersistenceService.ts") ||
    file.includes("temporal/adapters/TemporalActionAdapters.ts")
  ) {
    category = "COMPLIANT";
    reason = "Executed within canonical domain engine / outbox service enforcing CAS, versioning, receipts, and outbox events.";
  }
  // 2. Migration scripts
  else if (file.includes("migration/") || file.includes("scripts/")) {
    category = "INTENTIONALLY EXEMPT";
    reason = "Migration / maintenance utility operating on historical documents or schema backfill.";
  }
  // 3. Consumers (PhysicalReadinessConsumer, GoalIntelligenceConsumer, TemporalConflictConsumer, etc.)
  else if (file.includes("events/consumers/")) {
    category = "COMPLIANT";
    reason = "Asynchronous event consumer performing projection recalculation or soft-archival.";
  }
  // 4. Infrastructure repositories (e.g. BehavioralProfileRepository, CadenceProfileRepository)
  else if (file.includes("learning/BehavioralProfileRepository.ts") || file.includes("temporal/cadence/CadenceProfileRepository.ts")) {
    category = "INTENTIONALLY EXEMPT";
    reason = "Dedicated infrastructure projection repository with domain-bounded persistence.";
  }
  // 5. Non-aggregate models / schemas / audit logs (e.g., ActionAuditRecordModel, ProactiveActionLogModel, ExecutionWorkspaceModel)
  else if (
    file.includes("ActionAuditRecordModel") ||
    file.includes("ProactiveActionLogModel") ||
    file.includes("ExecutionEventRecordModel") ||
    file.includes("ExecutionWorkspaceModel") ||
    file.includes("proactive/ProactiveActionJournal.ts")
  ) {
    category = "INTENTIONALLY EXEMPT";
    reason = "Append-only operational audit log or internal orchestrator journal.";
  }
  // 6. Application API routes and handlers
  else if (file.startsWith("apps/web/app/api/") || file.includes("executionHandlers/")) {
    // If it's a direct MongoDB call on a business aggregate outside the engine, check if compliant delegation or direct mutation
    if (isStep1Target) {
      if (
        expression.includes("goalEngine") ||
        expression.includes("taskEngine") ||
        expression.includes("gymEngine")
      ) {
        category = "COMPLIANT";
        reason = "Delegated to canonical domain engine.";
      } else {
        // Let's inspect what it actually is!
        category = "NON-COMPLIANT";
        reason = "Direct database mutation in route/handler without canonical engine delegation.";
      }
    } else {
      category = "UNVERIFIED";
      reason = "Route mutation on non-Step-1 aggregate or unclassified model.";
    }
  }
  // 7. Non-database object methods (false positives like Map.set, Set.add, or non-Mongoose objects)
  else if (
    caller === "session" ||
    caller === "items" ||
    caller === "list" ||
    caller === "cache" ||
    caller === "queue"
  ) {
    category = "INTENTIONALLY EXEMPT";
    reason = "In-memory data structure or local variable, not a MongoDB persistent collection.";
  }

  analyzed.push({
    file,
    line,
    method,
    expression,
    caller,
    category,
    classificationReason: reason,
    aggregate,
    isStep1Target
  });
}

// Summary counts
const summary = {
  totalDiscovered: analyzed.length,
  step1TargetMutations: analyzed.filter(a => a.isStep1Target).length,
  byCategory: {
    COMPLIANT: analyzed.filter(a => a.category === "COMPLIANT").length,
    NON_COMPLIANT: analyzed.filter(a => a.category === "NON-COMPLIANT").length,
    INTENTIONALLY_EXEMPT: analyzed.filter(a => a.category === "INTENTIONALLY EXEMPT").length,
    UNREACHABLE_LEGACY: analyzed.filter(a => a.category === "UNREACHABLE LEGACY").length,
    UNVERIFIED: analyzed.filter(a => a.category === "UNVERIFIED").length,
  },
  nonCompliantEntries: analyzed.filter(a => a.category === "NON-COMPLIANT"),
  unverifiedEntries: analyzed.filter(a => a.category === "UNVERIFIED"),
};

console.log("=== MUTATION ANALYSIS SUMMARY ===");
console.log(`Total call sites: ${summary.totalDiscovered}`);
console.log(`Step 1 Target Aggregates: ${summary.step1TargetMutations}`);
console.log(`COMPLIANT: ${summary.byCategory.COMPLIANT}`);
console.log(`NON-COMPLIANT: ${summary.byCategory.NON_COMPLIANT}`);
console.log(`INTENTIONALLY EXEMPT: ${summary.byCategory.INTENTIONALLY_EXEMPT}`);
console.log(`UNREACHABLE LEGACY: ${summary.byCategory.UNREACHABLE_LEGACY}`);
console.log(`UNVERIFIED: ${summary.byCategory.UNVERIFIED}`);

fs.writeFileSync(
  path.join(__dirname, "analyzed_mutations.json"),
  JSON.stringify(summary, null, 2),
  "utf8"
);

