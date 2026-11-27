import { AuthoritativeKernelState } from "../kernel/IKernelCapabilityService";
import { deepFreeze } from "../../worldv2/KernelSnapshotBuilder";
import { PersonalMemoryRecord } from "../../memory/PersonalMemoryContracts";

// ──────────────────────────────────────────────
// Domain Projection Interfaces
// ──────────────────────────────────────────────

export type ProjectionDataStatus = "grounded" | "partial" | "unknown";

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
  dataStatus: ProjectionDataStatus;
  missingDomains: string[];
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
    progress: number | null;
    targetDate?: string;
  }>;
  criticalPathCount: number;
  workloadDensityScore: number; // 0 - 100
  relevantMemories?: ProjectedMemoryItem[];
  // Normalized cross-domain signals (Invariant: NO raw biometrics or sleep stage data)
  crossDomainSignals: {
    cognitiveReadinessScore: number | null; // 0 - 100 or null when unobserved
    physicalEnergyLevel: "low" | "medium" | "high" | "unknown";
    recoveryBand: "deficit" | "adequate" | "optimal" | "unknown";
  };
}

export interface HealthContextProjection {
  domain: "health";
  userId: string;
  timestamp: number;
  dataStatus: ProjectionDataStatus;
  missingDomains: string[];
  trainingStatus: "recovery" | "maintenance" | "overload" | "unknown";
  recentWorkouts: Array<{
    id: string;
    type: string;
    intensity: string;
    durationMinutes: number;
  }>;
  biometricSummary: {
    restingHeartRate?: number | null;
    sleepDurationHours: number | null;
    physicalRecoveryScore: number | null; // 0 - 100 or null when unobserved
  };
  nutritionSummary: {
    hydrationMl: number | null;
    caloriesEstimate: number | null;
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
  dataStatus: ProjectionDataStatus;
  missingDomains: string[];
  recoveryCapacity: number | null; // 0 - 100 or null when unobserved
  mentalBandwidthScore: number | null; // 0 - 100 or null when unobserved
  stressBand: "low" | "moderate" | "high" | "critical" | "unknown";
  sleepSummary: {
    totalHours: number | null;
    perceivedQuality: "poor" | "fair" | "good" | "excellent" | "unknown";
  };
  relevantMemories?: ProjectedMemoryItem[];
  // Normalized cross-domain signals (Invariant: Normalized metrics only, NO raw biometric streams)
  crossDomainSignals: {
    normalizedWorkload: {
      activeTasks: number;
      highPriorityCount: number;
      workloadPressure: "manageable" | "heavy" | "overwhelming";
    };
    physicalFatigue: "fresh" | "normal" | "fatigued" | "unknown";
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

function computeDataStatus(
  presentCount: number,
  totalExpectedCount: number
): ProjectionDataStatus {
  if (presentCount <= 0) return "unknown";
  if (presentCount >= totalExpectedCount) return "grounded";
  return "partial";
}

function mapSleepQuality(rawQuality?: number | null): "poor" | "fair" | "good" | "excellent" | "unknown" {
  if (typeof rawQuality !== "number" || Number.isNaN(rawQuality)) return "unknown";
  if (rawQuality >= 8) return "excellent";
  if (rawQuality >= 6) return "good";
  if (rawQuality >= 4) return "fair";
  return "poor";
}

/**
 * ContextProjectionEngine
 *
 * Transforms Canonical Kernel State into strictly isolated, domain-specific immutable projections.
 * Decision D1: Epistemically honest projections — missing empirical metrics are `null` or `"unknown"`,
 * never fabricated numeric defaults.
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
      ...readyNodes
        .filter((n) => n.entityType !== "goal")
        .map((n) => ({
          id: n.id,
          title: n.title,
          status: n.status,
          priority: n.priority,
          dueDate: n.metadata?.dueDate,
          isBlocked: false,
        })),
      ...blockedNodes
        .filter((b) => b.node.entityType !== "goal")
        .map((b) => ({
          id: b.node.id,
          title: b.node.title,
          status: b.node.status,
          priority: b.node.priority,
          dueDate: b.node.metadata?.dueDate,
          isBlocked: true,
        })),
    ];

    // Hydrate goals from ExecutionGraph goal nodes + WorldSnapshot goalPressure
    const goalMap = new Map<string, { id: string; title: string; progress: number | null; targetDate?: string }>();
    for (const gp of state.worldSnapshot?.subsystems?.goalPressure || []) {
      goalMap.set(gp.goalId, {
        id: gp.goalId,
        title: gp.goalTitle,
        progress: null,
      });
    }
    for (const n of [...readyNodes, ...blockedNodes.map((b) => b.node)]) {
      if (n.entityType === "goal") {
        goalMap.set(n.id, {
          id: n.id,
          title: n.title,
          progress: typeof n.metadata?.progress === "number" ? n.metadata.progress : null,
          targetDate: n.metadata?.targetDate || n.metadata?.dueDate,
        });
      }
    }
    const goals = Array.from(goalMap.values());

    // Compute derived workload density
    const totalPending = tasks.filter((t) => t.status === "pending").length;
    const workloadDensityScore = Math.min(100, totalPending * 15 + criticalPath.length * 10);

    // Derived normalized signals from lifeState / domainSnapshot (NO raw biometrics, NO fabricated defaults!)
    const lifeState = state.worldSnapshot?.subsystems?.lifeState;
    const cogSnapshot = state.domainSnapshot?.cognitiveState;
    const dailyLog = state.domainSnapshot?.dailyLog;

    const focusIndex =
      lifeState?.mentalState?.focusIndex ?? cogSnapshot?.focusIndex ?? null;
    const cognitiveReadinessScore =
      focusIndex != null ? Math.round(focusIndex * 100) : null;

    const physicalRecovery: number | null =
      lifeState?.physiologicalScore ??
      cogSnapshot?.physiologicalScore ??
      (dailyLog?.energyLevel != null ? Math.round((dailyLog.energyLevel / 10) * 100) : null);

    const physicalEnergyLevel: "low" | "medium" | "high" | "unknown" =
      physicalRecovery == null
        ? "unknown"
        : physicalRecovery >= 75
        ? "high"
        : physicalRecovery >= 50
        ? "medium"
        : "low";

    const recoveryBand: "deficit" | "adequate" | "optimal" | "unknown" =
      physicalRecovery == null
        ? "unknown"
        : physicalRecovery >= 80
        ? "optimal"
        : physicalRecovery >= 50
        ? "adequate"
        : "deficit";

    const missingSet = new Set<string>(state.domainSnapshot?.missingDomains || []);
    if (cognitiveReadinessScore === null) missingSet.add("cognitive_readiness");
    if (physicalRecovery === null) missingSet.add("physiological_recovery");
    if (tasks.length === 0 && goals.length === 0) missingSet.add("execution_graph");

    let groundedSignals = 0;
    if (tasks.length > 0 || goals.length > 0) groundedSignals++;
    if (cognitiveReadinessScore !== null) groundedSignals++;
    if (physicalRecovery !== null) groundedSignals++;
    const dataStatus = computeDataStatus(groundedSignals, 3);

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
      dataStatus,
      missingDomains: Array.from(missingSet),
      tasks,
      goals,
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

    const dailyLog = state.domainSnapshot?.dailyLog;
    const nutrition = state.domainSnapshot?.nutrition;
    const cogSnapshot = state.domainSnapshot?.cognitiveState;
    const recentWorkouts = state.domainSnapshot?.recentWorkouts || [];

    const physicalRecoveryScore: number | null =
      lifeState?.physiologicalScore ??
      cogSnapshot?.physiologicalScore ??
      (dailyLog?.energyLevel != null ? Math.round((dailyLog.energyLevel / 10) * 100) : null);

    const sleepDebt = lifeState?.mentalState?.sleepDebtHours ?? cogSnapshot?.sleepDebtHours ?? null;
    const sleepDurationHours: number | null =
      dailyLog?.sleepHours != null
        ? dailyLog.sleepHours
        : sleepDebt != null
        ? Math.max(0, 8 - sleepDebt)
        : null;

    const hydrationMl: number | null =
      nutrition?.hydrationMl ?? dailyLog?.hydrationMl ?? null;
    const caloriesEstimate: number | null =
      nutrition?.totalCalories ?? dailyLog?.caloriesEstimate ?? null;

    const trainingStatus: "recovery" | "maintenance" | "overload" | "unknown" =
      physicalRecoveryScore == null
        ? "unknown"
        : physicalRecoveryScore < 40
        ? "recovery"
        : physicalRecoveryScore >= 85 && recentWorkouts.length >= 3
        ? "overload"
        : "maintenance";

    const missingSet = new Set<string>(state.domainSnapshot?.missingDomains || []);
    if (physicalRecoveryScore === null) missingSet.add("physiological_recovery");
    if (sleepDurationHours === null) missingSet.add("sleep");
    if (hydrationMl === null && caloriesEstimate === null) missingSet.add("nutrition");
    if (recentWorkouts.length === 0) missingSet.add("workouts");

    let groundedSignals = 0;
    if (physicalRecoveryScore !== null) groundedSignals++;
    if (sleepDurationHours !== null) groundedSignals++;
    if (hydrationMl !== null || caloriesEstimate !== null) groundedSignals++;
    if (recentWorkouts.length > 0) groundedSignals++;
    const dataStatus = computeDataStatus(groundedSignals, 4);

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
      dataStatus,
      missingDomains: Array.from(missingSet),
      trainingStatus,
      recentWorkouts,
      biometricSummary: {
        physicalRecoveryScore,
        sleepDurationHours,
      },
      nutritionSummary: {
        hydrationMl,
        caloriesEstimate,
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

    const dailyLog = state.domainSnapshot?.dailyLog;
    const cogSnapshot = state.domainSnapshot?.cognitiveState;

    const recoveryCapacity: number | null =
      lifeState?.physiologicalScore ??
      cogSnapshot?.physiologicalScore ??
      (cogSnapshot?.recoveryCapacity != null ? Math.round(cogSnapshot.recoveryCapacity * 100) : null) ??
      (dailyLog?.energyLevel != null ? Math.round((dailyLog.energyLevel / 10) * 100) : null);

    const physicalFatigue: "fresh" | "normal" | "fatigued" | "unknown" =
      recoveryCapacity == null
        ? "unknown"
        : recoveryCapacity < 45
        ? "fatigued"
        : recoveryCapacity > 75
        ? "fresh"
        : "normal";

    const stressLevel: number | null =
      lifeState?.mentalState?.stressLevel ??
      cogSnapshot?.stressLevel ??
      (dailyLog?.stressLevel != null ? Math.min(1, Math.max(0, dailyLog.stressLevel / 10)) : null);

    const mentalBandwidthScore: number | null =
      stressLevel != null ? Math.round((1 - stressLevel) * 100) : null;

    const stressBand: "low" | "moderate" | "high" | "critical" | "unknown" =
      stressLevel == null
        ? "unknown"
        : stressLevel > 0.8
        ? "critical"
        : stressLevel > 0.6
        ? "high"
        : stressLevel > 0.3
        ? "moderate"
        : "low";

    const sleepDebt = lifeState?.mentalState?.sleepDebtHours ?? cogSnapshot?.sleepDebtHours ?? null;
    const totalSleepHours: number | null =
      dailyLog?.sleepHours != null
        ? dailyLog.sleepHours
        : sleepDebt != null
        ? Math.max(0, 8 - sleepDebt)
        : null;
    const perceivedQuality = mapSleepQuality(dailyLog?.sleepQuality);

    const missingSet = new Set<string>(state.domainSnapshot?.missingDomains || []);
    if (recoveryCapacity === null) missingSet.add("recovery_capacity");
    if (mentalBandwidthScore === null) missingSet.add("mental_bandwidth");
    if (totalSleepHours === null) missingSet.add("sleep");

    let groundedSignals = 0;
    if (recoveryCapacity !== null) groundedSignals++;
    if (mentalBandwidthScore !== null) groundedSignals++;
    if (totalSleepHours !== null) groundedSignals++;
    const dataStatus = computeDataStatus(groundedSignals, 3);

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
      dataStatus,
      missingDomains: Array.from(missingSet),
      recoveryCapacity,
      mentalBandwidthScore,
      stressBand,
      sleepSummary: {
        totalHours: totalSleepHours,
        perceivedQuality,
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
