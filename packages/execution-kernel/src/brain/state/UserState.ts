/**
 * User State System
 * 
 * ARCHITECTURAL NOTE:
 * Future phases will expand domain state attributes to include rich cognitive metadata such as:
 *   - source: string          (origin sensor or fact)
 *   - confidence: number      (0.0 - 1.0 confidence score)
 *   - lastUpdated: number     (UTC timestamp)
 * The current Phase 3 implementation remains intentionally simple (plain typed objects).
 */

export interface PhysicalState {
  sleepHours?: number;
  recoveryScore?: number;
  fatigueLevel?: "low" | "medium" | "high";
}

export interface MentalState {
  cognitiveLoad?: number;
  clarityScore?: number;
  focusCapacity?: number;
}

export interface EmotionalState {
  moodValence?: "positive" | "neutral" | "negative";
  stressIndex?: number;
}

export interface ProductivityState {
  deepWorkHours?: number;
  activeTaskCount?: number;
  overdueTaskCount?: number;
}

export interface LearningState {
  topicsStudied?: string[];
  activeStudyStreak?: number;
}

export interface FinancialState {
  dailySpend?: number;
  budgetHeadroom?: number;
}

export interface HealthState {
  caloriesLogged?: number;
  proteinLogged?: number;
  hydrationMl?: number;
  weightKg?: number;
}

export interface SocialState {
  meetingCount?: number;
  availableFreeTimeHours?: number;
}

export interface ExecutionState {
  runningJobCount?: number;
  queueHeadroom?: number;
}

export interface UserStateDomains {
  physical: PhysicalState;
  mental: MentalState;
  emotional: EmotionalState;
  productivity: ProductivityState;
  learning: LearningState;
  financial: FinancialState;
  health: HealthState;
  social: SocialState;
  execution: ExecutionState;
}

export class UserStateSystem {
  private domains: UserStateDomains;

  constructor() {
    this.domains = {
      physical: {},
      mental: {},
      emotional: {},
      productivity: {},
      learning: {},
      financial: {},
      health: {},
      social: {},
      execution: {},
    };
  }

  getDomain<K extends keyof UserStateDomains>(domain: K): UserStateDomains[K] {
    return this.domains[domain];
  }

  updateDomain<K extends keyof UserStateDomains>(
    domain: K,
    patch: Partial<UserStateDomains[K]>
  ): UserStateDomains[K] {
    this.domains[domain] = { ...this.domains[domain], ...patch };
    return this.domains[domain];
  }

  getAllState(): UserStateDomains {
    return this.domains;
  }
}
