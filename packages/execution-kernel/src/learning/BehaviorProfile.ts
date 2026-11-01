/**
 * BehaviorProfile.ts
 * 
 * @deprecated Milestone B — Phase B3 Loop 4:
 * Global singleton pattern is deprecated in favor of user-scoped
 * BehavioralProfileRepository with database persistence and authoritative journal.
 * User-scoped methods (getUserProfile, updateUserProfile) are provided for in-memory caching
 * and migration backward-compatibility.
 */

export interface TimeWindow {
  startHour: number; // 0 - 23
  endHour: number;   // 0 - 23
}

export interface UserBehavioralProfile {
  userId?: string;
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
 * Maps a persisted BehavioralProfile model document to UserBehavioralProfile DTO.
 */
export function mapModelToUserProfile(doc: any, userId?: string): UserBehavioralProfile {
  const metrics = doc?.metrics || {};
  return {
    userId: userId || String(doc?.userId || ""),
    preferredWorkHours: {
      startHour: Math.floor((doc?.wakeWindow?.averageMinutes || 540) / 60),
      endHour: Math.floor(((doc?.wakeWindow?.averageMinutes || 540) + 480) / 60) % 24,
    },
    preferredSleepWindow: {
      startHour: Math.floor((doc?.sleepWindow?.averageMinutes || 1380) / 60),
      endHour: Math.floor((doc?.wakeWindow?.averageMinutes || 480) / 60),
    },
    preferredDeepWorkDurationMinutes: 90,
    taskCompletionRate: typeof metrics.taskCompletionRate === "number" ? metrics.taskCompletionRate : 0.75,
    procrastinationTendency: typeof metrics.procrastinationTendency === "number" ? metrics.procrastinationTendency : 0.20,
    recoveryTendency: 0.3,
    interruptionFrequency: 2,
    scheduleStability: doc?.behaviorStabilityScore ?? 0.8,
    executionConsistency: typeof metrics.deepWorkConsistency === "number" ? metrics.deepWorkConsistency : 0.82,
    preferredRoutineOrder: ["Morning Routine", "Deep Work", "Exercise", "Evening Reflection"],
    lastUpdated: doc?.lastRecalculatedAt ? new Date(doc.lastRecalculatedAt).getTime() : Date.now(),
  };
}

/**
 * BehavioralProfile Subsystem (Deprecated Global Singleton Bridge)
 */
export class BehavioralProfile {
  private static instance: BehavioralProfile;
  private defaultProfile: UserBehavioralProfile = { ...DEFAULT_BEHAVIORAL_PROFILE };
  private userProfiles: Map<string, UserBehavioralProfile> = new Map();

  static getInstance(): BehavioralProfile {
    if (!BehavioralProfile.instance) {
      BehavioralProfile.instance = new BehavioralProfile();
    }
    return BehavioralProfile.instance;
  }

  /**
   * User-scoped profile accessor (B3 Isolated Multi-Tenant Path)
   */
  getUserProfile(userId: string): UserBehavioralProfile {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        ...DEFAULT_BEHAVIORAL_PROFILE,
        userId,
        lastUpdated: Date.now(),
      });
    }
    return { ...this.userProfiles.get(userId)! };
  }

  /**
   * User-scoped profile updater (B3 Isolated Multi-Tenant Path)
   */
  updateUserProfile(userId: string, updates: Partial<UserBehavioralProfile>): UserBehavioralProfile {
    const current = this.getUserProfile(userId);
    const updated: UserBehavioralProfile = {
      ...current,
      ...updates,
      userId,
      lastUpdated: Date.now(),
    };
    this.userProfiles.set(userId, updated);
    return { ...updated };
  }

  /**
   * @deprecated Use getUserProfile(userId) instead.
   */
  getProfile(): UserBehavioralProfile {
    return { ...this.defaultProfile };
  }

  /**
   * @deprecated Use updateUserProfile(userId, updates) instead.
   */
  updateProfile(updates: Partial<UserBehavioralProfile>): UserBehavioralProfile {
    this.defaultProfile = {
      ...this.defaultProfile,
      ...updates,
      lastUpdated: Date.now(),
    };
    return this.getProfile();
  }

  clearUserProfiles(): void {
    this.userProfiles.clear();
    this.defaultProfile = { ...DEFAULT_BEHAVIORAL_PROFILE };
  }
}
