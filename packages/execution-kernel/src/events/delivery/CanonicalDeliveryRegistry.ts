/**
 * CanonicalDeliveryRegistry.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Authoritative compile-time and runtime registry mapping all 24 canonical events
 * to their aggregate identity, required consumers, projection models, and surface invalidation tags.
 */

import {
  CanonicalEventType,
  ICanonicalDeliveryDefinition,
} from "../contracts/DeliveryContracts";

export const CANONICAL_DELIVERY_REGISTRY: Record<CanonicalEventType, ICanonicalDeliveryDefinition> = {
  // Task Lifecycle (6)
  "domain.task.created": {
    eventType: "domain.task.created",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "BehavioralIntelligenceConsumer"] as const,
    projectionDependencies: ["ExecutionGraphDerivedModel", "BehavioralPatternModel"] as const,
    invalidationTags: ["tasks", "dashboard"] as const,
    replayable: true,
  },
  "domain.task.completed": {
    eventType: "domain.task.completed",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: [
      "ExecutionGraphConsumer",
      "GoalIntelligenceConsumer",
      "CadenceLearningConsumer",
      "BehavioralIntelligenceConsumer",
    ] as const,
    projectionDependencies: [
      "ExecutionGraphDerivedModel",
      "GoalStatsModel",
      "CadenceProfileModel",
      "BehavioralPatternModel",
    ] as const,
    invalidationTags: ["tasks", "dashboard", "goals", "learning"] as const,
    replayable: true,
  },
  "domain.task.uncompleted": {
    eventType: "domain.task.uncompleted",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["ExecutionGraphDerivedModel", "GoalStatsModel"] as const,
    invalidationTags: ["tasks", "dashboard", "goals"] as const,
    replayable: true,
  },
  "domain.task.updated": {
    eventType: "domain.task.updated",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer"] as const,
    projectionDependencies: ["ExecutionGraphDerivedModel"] as const,
    invalidationTags: ["tasks", "dashboard"] as const,
    replayable: true,
  },
  "domain.task.deleted": {
    eventType: "domain.task.deleted",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["ExecutionGraphDerivedModel", "GoalStatsModel"] as const,
    invalidationTags: ["tasks", "dashboard", "goals"] as const,
    replayable: true,
  },
  "domain.task.deferred": {
    eventType: "domain.task.deferred",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["BehavioralIntelligenceConsumer"] as const,
    projectionDependencies: ["BehavioralPatternModel"] as const,
    invalidationTags: ["tasks", "dashboard"] as const,
    replayable: true,
  },

  // Goal Trajectory (5)
  "domain.goal.created": {
    eventType: "domain.goal.created",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["GoalStatsModel"] as const,
    invalidationTags: ["goals", "dashboard"] as const,
    replayable: true,
  },
  "domain.goal.updated": {
    eventType: "domain.goal.updated",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["GoalStatsModel"] as const,
    invalidationTags: ["goals", "dashboard", "insights"] as const,
    replayable: true,
  },
  "domain.goal.deleted": {
    eventType: "domain.goal.deleted",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["GoalStatsModel"] as const,
    invalidationTags: ["goals", "dashboard"] as const,
    replayable: true,
  },
  "domain.goal.progress_updated": {
    eventType: "domain.goal.progress_updated",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["GoalStatsModel"] as const,
    invalidationTags: ["goals", "dashboard", "insights"] as const,
    replayable: true,
  },
  "domain.goal.completed": {
    eventType: "domain.goal.completed",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"] as const,
    projectionDependencies: ["GoalStatsModel"] as const,
    invalidationTags: ["goals", "dashboard", "insights"] as const,
    replayable: true,
  },

  // Temporal Intelligence & Schedules (4)
  "domain.temporal.scheduled": {
    eventType: "domain.temporal.scheduled",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer", "CadenceLearningConsumer"] as const,
    projectionDependencies: ["ScheduleConflictReportModel", "CadenceProfileModel"] as const,
    invalidationTags: ["dashboard", "surface"] as const,
    replayable: true,
  },
  "domain.temporal.rescheduled": {
    eventType: "domain.temporal.rescheduled",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer", "CadenceLearningConsumer"] as const,
    projectionDependencies: ["ScheduleConflictReportModel", "CadenceProfileModel"] as const,
    invalidationTags: ["dashboard", "surface"] as const,
    replayable: true,
  },
  "domain.temporal.occurrence_created": {
    eventType: "domain.temporal.occurrence_created",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer"] as const,
    projectionDependencies: ["ScheduleConflictReportModel"] as const,
    invalidationTags: ["dashboard", "surface"] as const,
    replayable: true,
  },
  "domain.temporal.occurrence_deleted": {
    eventType: "domain.temporal.occurrence_deleted",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer"] as const,
    projectionDependencies: ["ScheduleConflictReportModel"] as const,
    invalidationTags: ["dashboard", "surface"] as const,
    replayable: true,
  },
  "domain.temporal.deleted": {
    eventType: "domain.temporal.deleted",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer"] as const,
    projectionDependencies: ["ScheduleConflictReportModel"] as const,
    invalidationTags: ["dashboard", "surface"] as const,
    replayable: true,
  },

  // Physical Readiness & Wearables
  "domain.health.workout_logged": {
    eventType: "domain.health.workout_logged",
    aggregateType: "workout",
    aggregateIdField: "sessionId",
    category: "DOMAIN_EVENT",
    requiredConsumers: [
      "PhysicalReadinessConsumer",
      "CadenceLearningConsumer",
      "BehavioralIntelligenceConsumer",
    ] as const,
    projectionDependencies: [
      "PhysicalReadinessDerivedModel",
      "CadenceProfileModel",
      "BehavioralPatternModel",
    ] as const,
    invalidationTags: ["world", "dashboard", "learning"] as const,
    replayable: true,
  },
  "domain.physical.workout_logged": {
    eventType: "domain.physical.workout_logged",
    aggregateType: "workout",
    aggregateIdField: "sessionId",
    category: "DOMAIN_EVENT",
    requiredConsumers: [
      "PhysicalReadinessConsumer",
      "CadenceLearningConsumer",
      "BehavioralIntelligenceConsumer",
    ] as const,
    projectionDependencies: [
      "PhysicalReadinessDerivedModel",
      "CadenceProfileModel",
      "BehavioralPatternModel",
    ] as const,
    invalidationTags: ["world", "dashboard", "learning"] as const,
    replayable: true,
  },
  "domain.physical.session_deleted": {
    eventType: "domain.physical.session_deleted",
    aggregateType: "workout",
    aggregateIdField: "sessionId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["PhysicalReadinessConsumer"] as const,
    projectionDependencies: ["PhysicalReadinessDerivedModel"] as const,
    invalidationTags: ["world", "dashboard"] as const,
    replayable: true,
  },
  "telemetry.wearables.ingested": {
    eventType: "telemetry.wearables.ingested",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "TELEMETRY_EVENT",
    requiredConsumers: ["PhysicalReadinessConsumer", "CognitiveHistoryConsumer"] as const,
    projectionDependencies: ["PhysicalReadinessDerivedModel", "CognitiveChronicleModel"] as const,
    invalidationTags: ["world", "dashboard"] as const,
    replayable: false,
  },

  // Analytical Context (3)
  "analytical.schedule.conflict_detected": {
    eventType: "analytical.schedule.conflict_detected",
    aggregateType: "occurrence",
    aggregateIdField: "conflictId",
    category: "ANALYTICAL_EVENT",
    requiredConsumers: [] as const,
    projectionDependencies: ["ScheduleConflictReportModel"] as const,
    invalidationTags: ["dashboard", "surface", "assistant"] as const,
    replayable: true,
  },
  "observation.cognitive.assessed": {
    eventType: "observation.cognitive.assessed",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "OBSERVATION_EVENT",
    requiredConsumers: ["CognitiveHistoryConsumer"] as const,
    projectionDependencies: ["CognitiveChronicleModel"] as const,
    invalidationTags: ["world", "learning"] as const,
    replayable: false,
  },
  "domain.signal.logged": {
    eventType: "domain.signal.logged",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["BehavioralIntelligenceConsumer"] as const,
    projectionDependencies: ["BehavioralPatternModel"] as const,
    invalidationTags: ["insights", "assistant"] as const,
    replayable: false,
  },

  // Autonomous Cycle & Governance (3)
  "autonomous.cycle_evaluated": {
    eventType: "autonomous.cycle_evaluated",
    aggregateType: "autonomous_cycle",
    aggregateIdField: "cycleId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [] as const,
    projectionDependencies: ["AutonomousCycleLedger"] as const,
    invalidationTags: ["diagnostics"] as const,
    replayable: false,
  },
  "autonomous.intervention_triggered": {
    eventType: "autonomous.intervention_triggered",
    aggregateType: "autonomous_intervention",
    aggregateIdField: "interventionId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [] as const,
    projectionDependencies: ["ActionPlanModel"] as const,
    invalidationTags: ["dashboard", "diagnostics", "surface"] as const,
    replayable: true,
  },
  "autonomous.action_executed": {
    eventType: "autonomous.action_executed",
    aggregateType: "autonomous_action",
    aggregateIdField: "actionId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [] as const,
    projectionDependencies: ["AutonomousExecutionLedgerModel"] as const,
    invalidationTags: ["dashboard", "diagnostics", "governance"] as const,
    replayable: true,
  },
};

/**
 * Returns true if the string is an authoritative canonical event type.
 */
export function isCanonicalEventType(type: string): type is CanonicalEventType {
  return Object.prototype.hasOwnProperty.call(CANONICAL_DELIVERY_REGISTRY, type);
}

/**
 * Retrieves the authoritative delivery definition for an event.
 * Throws an Error if the event is unregistered (zero unknown fallback).
 */
export function getDeliveryDefinition(eventType: string): ICanonicalDeliveryDefinition {
  if (!isCanonicalEventType(eventType)) {
    throw new Error(
      `[CanonicalDeliveryRegistry] Unregistered canonical event type: '${eventType}'. Zero fallback permitted.`
    );
  }
  return CANONICAL_DELIVERY_REGISTRY[eventType];
}

/**
 * Returns all 24 canonical event types.
 */
export function getAllCanonicalEventTypes(): CanonicalEventType[] {
  return Object.keys(CANONICAL_DELIVERY_REGISTRY) as CanonicalEventType[];
}

/**
 * Retrieves the required consumers for an event type.
 */
export function getRequiredConsumersForEvent(eventType: CanonicalEventType): readonly string[] {
  return CANONICAL_DELIVERY_REGISTRY[eventType]?.requiredConsumers || [];
}

/**
 * Retrieves the invalidation tags for an event type.
 */
export function getInvalidationTagsForEvent(eventType: CanonicalEventType): readonly string[] {
  return CANONICAL_DELIVERY_REGISTRY[eventType]?.invalidationTags || [];
}
