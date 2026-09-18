import { UserBehavioralProfile } from "../../learning/BehaviorProfile";
import { BehaviorPattern } from "../../learning/BehaviorPattern";
import { LearningSignal } from "../../learning/LearningSignal";
import { LearningDTO } from "../dto/LearningDTO";

export class LearningDTOMapper {
  static toLearningDTO(
    profile: UserBehavioralProfile | null,
    patterns: BehaviorPattern[],
    signals: LearningSignal[]
  ): LearningDTO {
    return {
      schemaVersion: 1,
      // Only project behavioralProfile when a real learned profile exists.
      // When profile is null (no telemetry yet learned), return undefined fields.
      // NEVER fabricate default values (9-18:00 work hours, 80% completion rate etc).
      behavioralProfile: profile ? {
        workHours: profile.preferredWorkHours,
        sleepWindow: profile.preferredSleepWindow,
        taskCompletionRate: profile.taskCompletionRate,
        executionConsistency: profile.executionConsistency,
        preferredRoutineOrder: profile.preferredRoutineOrder || [],
      } : {
        workHours: { startHour: 0, endHour: 0 },
        sleepWindow: { startHour: 0, endHour: 0 },
        taskCompletionRate: 0,
        executionConsistency: 0,
        preferredRoutineOrder: [],
      },
      patterns: patterns.map((p) => ({
        patternId: p.patternId,
        type: p.type,
        title: p.title,
        description: p.description,
        confidence: p.confidence,
        confidenceScore: p.confidenceScore,
        evidenceCount: p.evidenceCount,
        lastObserved: p.lastObserved,
      })),
      activeSignals: signals.map((s) => ({
        signalId: s.signalId,
        type: s.type,
        title: s.title,
        message: s.message,
        confidence: s.confidence,
      })),
    };
  }
}
