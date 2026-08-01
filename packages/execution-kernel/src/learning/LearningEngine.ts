import { BehaviorPattern } from "./BehaviorPattern";
import { BehaviorPatternLibrary } from "./BehaviorPatternLibrary";
import { BehavioralProfile, UserBehavioralProfile } from "./BehaviorProfile";
import { LearningSignal } from "./LearningSignal";
import { HabitLearningEngine } from "./HabitLearningEngine";
import { ExecutionOutcome } from "../reflection/ExecutionOutcome";
import { generateId } from "../shared/ids";

export interface LearningEngineOutput {
  activeProfile: UserBehavioralProfile;
  learnedPatterns: BehaviorPattern[];
  emittedSignals: LearningSignal[];
}

/**
 * LearningEngine Subsystem
 * 
 * SOLE OWNER of observing execution history and deriving deterministic behavioral learning signals.
 * 
 * ARCHITECTURAL RULES:
 * - 100% deterministic, replayable, explainable, incremental, causal.
 * - NO AI, NO Neural Networks, NO Embeddings, NO Randomness.
 * - NEVER executes tasks directly — only emits LearningSignals for downstream components.
 */
export class LearningEngine {
  private static instance: LearningEngine;

  static getInstance(): LearningEngine {
    if (!LearningEngine.instance) {
      LearningEngine.instance = new LearningEngine();
    }
    return LearningEngine.instance;
  }

  processObservations(outcomes: ExecutionOutcome[]): LearningEngineOutput {
    console.log(`🧠 [LEARNING_ENGINE] Processing ${outcomes.length} execution outcome(s) for behavioral learning...`);

    const habitEngine = HabitLearningEngine.getInstance();
    const patternLibrary = BehaviorPatternLibrary.getInstance();
    const profileEngine = BehavioralProfile.getInstance();

    // 1. Observe habit patterns from execution outcomes
    const learnedPatterns = habitEngine.observeExecutionOutcomes(outcomes);

    // 2. Update user behavioral profile stats
    const totalOutcomes = outcomes.length;
    if (totalOutcomes > 0) {
      const completedCount = outcomes.filter(
        (o) => o.type === "TaskCompleted" || o.result?.success === true
      ).length;
      const completionRate = Number((completedCount / totalOutcomes).toFixed(2));

      profileEngine.updateProfile({
        taskCompletionRate: completionRate,
        executionConsistency: Math.min(1.0, completionRate + 0.1),
      });
    }

    // 3. Emit non-mutating LearningSignals based on high-confidence patterns
    const allPatterns = patternLibrary.getAllPatterns();
    const emittedSignals: LearningSignal[] = [];

    for (const pattern of allPatterns) {
      if (pattern.confidenceScore >= 0.4) {
        if (pattern.type === "ExecutionRhythm") {
          emittedSignals.push({
            signalId: generateId("sig"),
            type: "PreferMorning",
            title: `Optimize Rhythm: ${pattern.title}`,
            message: `User has ${pattern.confidence} confidence rhythm for "${pattern.title}". Prioritize in morning schedule.`,
            confidence: pattern.confidence,
            confidenceScore: pattern.confidenceScore,
            evidenceCount: pattern.evidenceCount,
            sourcePatternId: pattern.patternId,
            createdAt: Date.now(),
          });
        }
      }
    }

    console.log(
      `🧠 [LEARNING_ENGINE] Processing complete. Patterns: ${allPatterns.length}, Emitted Signals: ${emittedSignals.length}`
    );

    return {
      activeProfile: profileEngine.getProfile(),
      learnedPatterns: allPatterns,
      emittedSignals,
    };
  }
}
