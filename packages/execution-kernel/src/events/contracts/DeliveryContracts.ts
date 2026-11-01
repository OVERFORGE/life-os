/**
 * DeliveryContracts.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Type definitions governing the 24 canonical event delivery specifications,
 * invalidation tagging, and compile-time exhaustiveness guarantees.
 */

import { CanonicalEventCategory, AggregateType } from "./CanonicalEventContracts";

export type CanonicalEventType =
  // Productivity / Task Lifecycle (6)
  | "domain.task.created"
  | "domain.task.completed"
  | "domain.task.uncompleted"
  | "domain.task.updated"
  | "domain.task.deleted"
  | "domain.task.deferred"

  // Goal Trajectory (5)
  | "domain.goal.created"
  | "domain.goal.updated"
  | "domain.goal.deleted"
  | "domain.goal.progress_updated"
  | "domain.goal.completed"

  // Temporal Intelligence & Schedules (5)
  | "domain.temporal.scheduled"
  | "domain.temporal.rescheduled"
  | "domain.temporal.occurrence_created"
  | "domain.temporal.occurrence_deleted"
  | "domain.temporal.deleted"

  // Physical Readiness & Wearables (4)
  | "domain.health.workout_logged"
  | "domain.physical.workout_logged"
  | "domain.physical.session_deleted"
  | "telemetry.wearables.ingested"

  // Analytical & Cognitive Context (3)
  | "analytical.schedule.conflict_detected"
  | "observation.cognitive.assessed"
  | "domain.signal.logged"

  // Autonomous Governance & Auditing (3)
  | "autonomous.cycle_evaluated"
  | "autonomous.intervention_triggered"
  | "autonomous.action_executed";

export type DeliveryChannel =
  | "dashboard"
  | "tasks"
  | "goals"
  | "timeline"
  | "surface"
  | "world"
  | "learning"
  | "insights"
  | "diagnostics"
  | "governance"
  | "assistant";

export interface ICanonicalDeliveryDefinition {
  eventType: CanonicalEventType;
  aggregateType: AggregateType;
  aggregateIdField: string;
  category: CanonicalEventCategory;
  requiredConsumers: readonly string[];
  projectionDependencies: readonly string[];
  invalidationTags: readonly string[];
  replayable: boolean;
}

export interface IWireDeliveryFrame {
  eventId: string;
  eventType: CanonicalEventType;
  aggregateId: string;
  aggregateType: string;
  deliverySeq: number;
  seqConn: number;
  occurredAt: number;
  invalidationTags: string[];
  correlationId?: string;
}

export interface IClientInvalidationMessage {
  type: "INVALIDATE";
  tags: string[];
  deliverySeq: number;
  eventId: string;
  timestamp: number;
}
