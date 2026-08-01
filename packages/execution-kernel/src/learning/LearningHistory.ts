import { ConfidenceTier } from "./BehaviorPattern";

export interface LearningRecord {
  learningId: string;
  timestamp: number;
  observation: string;
  previousConfidence: ConfidenceTier | "Unobserved";
  newConfidence: ConfidenceTier;
  evidenceCount: number;
  affectedPatternId: string;
}

/**
 * LearningHistory Subsystem
 * 
 * SOLE OWNER of immutable behavioral learning audit logs.
 * Enables deterministic replay and historical verification of all learned user patterns.
 */
export class LearningHistory {
  private static instance: LearningHistory;
  private records: LearningRecord[] = [];
  private patternIndex: Map<string, LearningRecord[]> = new Map();

  static getInstance(): LearningHistory {
    if (!LearningHistory.instance) {
      LearningHistory.instance = new LearningHistory();
    }
    return LearningHistory.instance;
  }

  addRecord(record: LearningRecord): void {
    this.records.push(record);

    if (!this.patternIndex.has(record.affectedPatternId)) {
      this.patternIndex.set(record.affectedPatternId, []);
    }
    this.patternIndex.get(record.affectedPatternId)!.push(record);

    console.log(
      `📜 [LEARNING_HISTORY] Recorded learning ${record.learningId} for pattern ${record.affectedPatternId} (${record.previousConfidence} -> ${record.newConfidence})`
    );
  }

  getAllRecords(): LearningRecord[] {
    return [...this.records];
  }

  getRecordsByPattern(patternId: string): LearningRecord[] {
    return this.patternIndex.get(patternId) || [];
  }
}
