import { AuthoritativeKernelState } from "../kernel/IKernelCapabilityService";
import { deepFreeze } from "../../worldv2/KernelSnapshotBuilder";
import { PersonalMemoryRecord } from "../../memory/PersonalMemoryContracts";

// ──────────────────────────────────────────────
// Domain Projection Interfaces
// ──────────────────────────────────────────────

export interface ProjectedMemoryItem {
  id: string;
  summary: string;
  content: string;
  domain: string;
  source: string;
  confidence: number;
}

export interface ProductivityContextProjection {
  domain: "productivity";
  userId: string;
  timestamp: number;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    dueDate?: string;
    isBlocked: boolean;
  }>;
  goals: Array<{
    id: string;
    title: string;
    progress: number;
    targetDate?: string;
  }>;
  criticalPathCount: number;
  workloadDensityScore: number; // 0 - 100
  relevantMemories?: ProjectedMemoryItem[];
  // Normalized cross-domain signals (Invariant: NO raw biometrics or sleep stage data)
  crossDomainSignals: {
    cognitiveReadinessScore: number; // 0 - 100
    physicalEnergyLevel: "low" | "medium" | "high";
    recoveryBand: "deficit" | "adequate" | "optimal";
  };
}

export interface HealthContextProjection {
  domain: "health";
  userId: string;
  timestamp: number;
  trainingStatus: "recovery" | "maintenance" | "overload";
  recentWorkouts: Array<{
    id: string;
    type: string;
    intensity: string;
    durationMinutes: number;
  }>;
  biometricSummary: {
    restingHeartRate?: number;
    sleepDurationHours?: number;
    physicalRecoveryScore: number; // 0 - 100
  };
  nutritionSummary: {
    hydrationMl?: number;
    caloriesEstimate?: number;
  };
  relevantMemories?: ProjectedMemoryItem[];
  // Normalized cross-domain signals (Invariant: NO task descriptions, titles, or financial metadata)
  crossDomainSignals: {
    schedulePressure: "low" | "medium" | "high";
    pendingTaskCount: number;
    availableExerciseWindowMinutes: number;
  };
}

export interface WellnessContextProjection {
  domain: "wellness";
  userId: string;
  timestamp: number;
  recoveryCapacity: number; // 0 - 100
  mentalBandwidthScore: number; // 0 - 100
  stressBand: "low" | "moderate" | "high" | "critical";
  sleepSummary: {
    totalHours: number;
    perceivedQuality: "poor" | "fair" | "good" | "excellent";
  };
  relevantMemories?: ProjectedMemoryItem[];
  // Normalized cross-domain signals (Invariant: Normalized metrics only, NO raw biometric streams)
  crossDomainSignals: {
    normalizedWorkload: {
      activeTasks: number;
      highPriorityCount: number;
      workloadPressure: "manageable" | "heavy" | "overwhelming";
    };
    physicalFatigue: "fresh" | "normal" | "fatigued";
  };
}

// ──────────────────────────────────────────────
// Forbidden Field Leakage Guards (TC-15)
// ──────────────────────────────────────────────

export const FORBIDDEN_PRODUCTIVITY_FIELDS = [
  "rawHrv",
  "hrv",
  "deepSleepMinutes",
  "remSleepMinutes",
  "rawSleepStages",
  "heartRateVariability",
  "medicalNotes",
  "bloodPressure",
  "ecgWaveform",
];

export const FORBIDDEN_HEALTH_FIELDS = [
  "taskDescriptions",
  "taskDetails",
  "financialMetadata",
  "confidentialNotes",
  "bankAccount",
  "salary",
  "projectDeadlinesDetailed",
];

export const FORBIDDEN_WELLNESS_FIELDS = [
  "rawBiometricStream",
  "taskDescriptions",
  "financialMetadata",
  "confidentialNotes",
];

/**
 * ContextProjectionEngine
 * 
 * Transforms Canonical Kernel State into strictly isolated, domain-specific immutable projections.
 * Invariant 15: No raw biometric leakage to Productivity; No task descriptions to Health.
 */
export class ContextProjectionEngine {
  /**
   * Projects authoritative state for ProductivityAgent.
   */
  projectProductivity(
    state: AuthoritativeKernelState,
    memories?: PersonalMemoryRecord[]
  ): Readonly<ProductivityContextProjection> {
    const readyNodes = state.graphSnapshot?.readyNodes || [];
    const blockedNodes = state.graphSnapshot?.blockedNodes || [];
    const criticalPath = state.graphSnapshot?.criticalPath || [];

    const tasks = [
      ...readyNodes.map((n) => ({
        id: n.id,
        title: n.title,
        status: n.status,
        priority: n.priority,
        dueDate: n.metadata?.dueDate,
        isBlocked: false,
      })),
      ...blockedNodes.map((b) => ({
        id: b.node.id,
        title: b.node.title,
        status: b.node.status,
        priority: b.node.priority,
        dueDate: b.node.metadata?.dueDate,
        isBlocked: true,
      })),
    ];

    // Compute derived workload density
    const totalPending = tasks.filter((t) => t.status === "pending").length;
    const workloadDensityScore = Math.min(100, totalPending * 15 + criticalPath.length * 10);

    // Derived normalized signals from lifeState (NO raw biometrics!)
    const lifeState = state.worldSnapshot?.subsystems?.lifeState;
    const focusIndex = lifeState?.mentalState?.focusIndex;
    const cognitiveReadinessScore = focusIndex != null ? Math.round(focusIndex * 100) : 75;
    const physicalRecovery = lifeState?.physiologicalScore ?? 70;

    const physicalEnergyLevel: "low" | "medium" | "high" =
      physicalRecovery >= 75 ? "high" : physicalRecovery >= 50 ? "medium" : "low";

    const recoveryBand: "deficit" | "adequate" | "optimal" =
      physicalRecovery >= 80 ? "optimal" : physicalRecovery >= 50 ? "adequate" : "deficit";

    const relevantMemories: ProjectedMemoryItem[] | undefined = memories
      ? memories
          .filter(
            (m) =>
              !m.isArchived &&
              (!m.validTo || m.validTo > Date.now()) &&
              (m.domain === "productivity" || m.domain === "general" || m.domain === "identity")
          )
          .map((m) => ({
            id: m.id,
            summary: m.summary,
            content: m.content,
            domain: m.domain,
            source: m.source,
            confidence: m.confidence,
          }))
      : undefined;

    const projection: ProductivityContextProjection = {
      domain: "productivity",
      userId: state.userId,
      timestamp: state.timestamp,
      tasks,
      goals: [],
      criticalPathCount: criticalPath.length,
      workloadDensityScore,
      relevantMemories,
      crossDomainSignals: {
        cognitiveReadinessScore,
        physicalEnergyLevel,
        recoveryBand,
      },
    };

    this.assertNoForbiddenFields(projection, FORBIDDEN_PRODUCTIVITY_FIELDS, "Productivity");
    return deepFreeze(projection);
  }

  /**
   * Projects authoritative state for HealthAgent.
   */
  projectHealth(
    state: AuthoritativeKernelState,
    memories?: PersonalMemoryRecord[]
  ): Readonly<HealthContextProjection> {
    const lifeState = state.worldSnapshot?.subsystems?.lifeState;
    const readyNodes = state.graphSnapshot?.readyNodes || [];
    const pendingCount = readyNodes.length;

    // Derived schedule pressure from task workload (NO task descriptions or titles!)
    const schedulePressure: "low" | "medium" | "high" =
      pendingCount > 6 ? "high" : pendingCount > 3 ? "medium" : "low";

    const availableExerciseWindowMinutes = schedulePressure === "high" ? 30 : 60;

    const physicalRecoveryScore = lifeState?.physiologicalScore ?? 70;
    const sleepDebt = lifeState?.mentalState?.sleepDebtHours;
    const sleepDurationHours = sleepDebt != null ? Math.max(4, 8 - sleepDebt) : 7;

    const relevantMemories: ProjectedMemoryItem[] | undefined = memories
      ? memories
          .filter(
            (m) =>
              !m.isArchived &&
              (!m.validTo || m.validTo > Date.now()) &&
              (m.domain === "health" || m.domain === "general" || m.domain === "identity")
          )
          .map((m) => ({
            id: m.id,
            summary: m.summary,
            content: m.content,
            domain: m.domain,
            source: m.source,
            confidence: m.confidence,
          }))
      : undefined;

    const projection: HealthContextProjection = {
      domain: "health",
      userId: state.userId,
      timestamp: state.timestamp,
      trainingStatus: physicalRecoveryScore < 40 ? "recovery" : "maintenance",
      recentWorkouts: [],
      biometricSummary: {
        physicalRecoveryScore,
        sleepDurationHours,
      },
      nutritionSummary: {
        hydrationMl: 2000,
      },
      relevantMemories,
      crossDomainSignals: {
        schedulePressure,
        pendingTaskCount: pendingCount,
        availableExerciseWindowMinutes,
      },
    };

    this.assertNoForbiddenFields(projection, FORBIDDEN_HEALTH_FIELDS, "Health");
    return deepFreeze(projection);
  }

  /**
   * Projects authoritative state for WellnessAgent.
   */
  projectWellness(
    state: AuthoritativeKernelState,
    memories?: PersonalMemoryRecord[]
  ): Readonly<WellnessContextProjection> {
    const lifeState = state.worldSnapshot?.subsystems?.lifeState;
    const readyNodes = state.graphSnapshot?.readyNodes || [];
    const activeTasks = readyNodes.length;
    const highPriorityCount = readyNodes.filter((n) => n.priority >= 3).length;

    const workloadPressure: "manageable" | "heavy" | "overwhelming" =
      activeTasks > 8 ? "overwhelming" : activeTasks > 4 ? "heavy" : "manageable";

    const physicalRecovery = lifeState?.physiologicalScore ?? 70;
    const physicalFatigue: "fresh" | "normal" | "fatigued" =
      physicalRecovery < 45 ? "fatigued" : physicalRecovery > 75 ? "fresh" : "normal";

    const stressLevel = lifeState?.mentalState?.stressLevel;
    const mentalBandwidthScore = stressLevel != null ? Math.round((1 - stressLevel) * 100) : 75;
    const stressBand: "low" | "moderate" | "high" | "critical" =
      stressLevel != null
        ? stressLevel > 0.8
          ? "critical"
          : stressLevel > 0.6
          ? "high"
          : stressLevel > 0.3
          ? "moderate"
          : "low"
        : "low";

    const relevantMemories: ProjectedMemoryItem[] | undefined = memories
      ? memories
          .filter(
            (m) =>
              !m.isArchived &&
              (!m.validTo || m.validTo > Date.now()) &&
              (m.domain === "wellness" || m.domain === "general" || m.domain === "identity")
          )
          .map((m) => ({
            id: m.id,
            summary: m.summary,
            content: m.content,
            domain: m.domain,
            source: m.source,
            confidence: m.confidence,
          }))
      : undefined;

    const projection: WellnessContextProjection = {
      domain: "wellness",
      userId: state.userId,
      timestamp: state.timestamp,
      recoveryCapacity: physicalRecovery,
      mentalBandwidthScore,
      stressBand,
      sleepSummary: {
        totalHours: 7.5,
        perceivedQuality: "good",
      },
      relevantMemories,
      crossDomainSignals: {
        normalizedWorkload: {
          activeTasks,
          highPriorityCount,
          workloadPressure,
        },
        physicalFatigue,
      },
    };

    this.assertNoForbiddenFields(projection, FORBIDDEN_WELLNESS_FIELDS, "Wellness");
    return deepFreeze(projection);
  }

  /**
   * Validates that an object contains no forbidden keys anywhere in its structure.
   */
  assertNoForbiddenFields(obj: any, forbiddenFields: string[], domain: string): void {
    const jsonString = JSON.stringify(obj).toLowerCase();
    for (const field of forbiddenFields) {
      if (jsonString.includes(`"${field.toLowerCase()}":`)) {
        throw new Error(
          `[SECURITY_VIOLATION]: Forbidden field '${field}' leaked into ${domain} context projection!`
        );
      }
    }
  }
}
