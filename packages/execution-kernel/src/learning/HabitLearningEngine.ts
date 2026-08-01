import { BehaviorPattern } from "./BehaviorPattern";
import { BehaviorPatternLibrary } from "./BehaviorPatternLibrary";
import { BehaviorEvolution } from "./BehaviorEvolution";
import { generateId } from "../shared/ids";
import { ExecutionOutcome } from "../reflection/ExecutionOutcome";

/**
 * HabitLearningEngine Subsystem
 * 
 * SOLE OWNER of habit observation and pattern recognition.
 * Observes task execution sequences and routine adherence to derive deterministic HabitPatterns.
 */
export class HabitLearningEngine {
  private static instance: HabitLearningEngine;

  static getInstance(): HabitLearningEngine {
    if (!HabitLearningEngine.instance) {
      HabitLearningEngine.instance = new HabitLearningEngine();
    }
    return HabitLearningEngine.instance;
  }

  observeExecutionOutcomes(outcomes: ExecutionOutcome[]): BehaviorPattern[] {
    const library = BehaviorPatternLibrary.getInstance();
    const evolution = BehaviorEvolution.getInstance();
    const learnedPatterns: BehaviorPattern[] = [];

    for (const outcome of outcomes) {
      const typeStr = outcome.type;

      if (typeStr === "TaskCompleted" || outcome.result?.success === true) {
        const taskTitle = outcome.payload?.title || outcome.result?.title || "Task Execution";

        // Check if pattern for this work rhythm exists
        let pattern = library.getPatternsByType("ExecutionRhythm").find((p) => p.title.includes(taskTitle));

        if (!pattern) {
          pattern = {
            patternId: generateId("pat"),
            type: "ExecutionRhythm",
            title: `Consistent Execution: ${taskTitle}`,
            description: `User consistently completes "${taskTitle}" tasks.`,
            confidence: "Low",
            confidenceScore: 0.2,
            evidenceCount: 1,
            firstObserved: outcome.timestamp,
            lastObserved: outcome.timestamp,
            evidenceDetails: [`[${new Date(outcome.timestamp).toISOString().split("T")[0]}] Completed task "${taskTitle}"`],
          };
          library.savePattern(pattern);
        }

        const updated = evolution.recordObservation({
          pattern,
          observation: `Completed task "${taskTitle}" successfully.`,
          isPositive: true,
          timestamp: outcome.timestamp,
        });

        learnedPatterns.push(updated);
      }
    }

    return learnedPatterns;
  }
}
