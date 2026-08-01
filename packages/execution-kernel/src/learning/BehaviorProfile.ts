export interface TimeWindow {
  startHour: number; // 0 - 23
  endHour: number;   // 0 - 23
}

export interface UserBehavioralProfile {
  preferredWorkHours: TimeWindow;
  preferredSleepWindow: TimeWindow;
  preferredDeepWorkDurationMinutes: number;
  taskCompletionRate: number;       // 0.0 to 1.0
  procrastinationTendency: number;   // 0.0 to 1.0
  recoveryTendency: number;          // 0.0 to 1.0
  interruptionFrequency: number;     // events per day
  scheduleStability: number;         // 0.0 to 1.0
  executionConsistency: number;     // 0.0 to 1.0
  preferredRoutineOrder: string[];
  lastUpdated: number;
}

export const DEFAULT_BEHAVIORAL_PROFILE: UserBehavioralProfile = {
  preferredWorkHours: { startHour: 9, endHour: 18 },
  preferredSleepWindow: { startHour: 23, endHour: 7 },
  preferredDeepWorkDurationMinutes: 90,
  taskCompletionRate: 0.75,
  procrastinationTendency: 0.2,
  recoveryTendency: 0.3,
  interruptionFrequency: 2,
  scheduleStability: 0.8,
  executionConsistency: 0.82,
  preferredRoutineOrder: ["Morning Routine", "Deep Work", "Exercise", "Evening Reflection"],
  lastUpdated: Date.now(),
};

/**
 * BehavioralProfile Subsystem
 * 
 * SOLE OWNER of the user's explicit, explainable behavioral model.
 * Zero embeddings, zero black-box weights.
 */
export class BehavioralProfile {
  private static instance: BehavioralProfile;
  private profile: UserBehavioralProfile = { ...DEFAULT_BEHAVIORAL_PROFILE };

  static getInstance(): BehavioralProfile {
    if (!BehavioralProfile.instance) {
      BehavioralProfile.instance = new BehavioralProfile();
    }
    return BehavioralProfile.instance;
  }

  getProfile(): UserBehavioralProfile {
    return { ...this.profile };
  }

  updateProfile(updates: Partial<UserBehavioralProfile>): UserBehavioralProfile {
    this.profile = {
      ...this.profile,
      ...updates,
      lastUpdated: Date.now(),
    };
    console.log(`👤 [BEHAVIORAL_PROFILE] Updated profile. Task completion rate: ${this.profile.taskCompletionRate}`);
    return this.getProfile();
  }
}
