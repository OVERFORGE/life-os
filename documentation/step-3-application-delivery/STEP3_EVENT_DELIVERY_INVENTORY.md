# LIFEOS — STEP 3 CANONICAL EVENT DELIVERY INVENTORY
## Exhaustive 24-Event Delivery Registry, Invalidation Mappings & Causal Contracts
**Milestone:** Step 3 V2.2.0  
**Governing Architecture:** LifeOS V2.3.0 Frozen Specification  
**Authority:** The Executioners (ExE)  
**Status:** RECONCILED & EXHAUSTIVELY TYPED  

---

## 1. ARCHITECTURAL CONTRACT & TYPING MANDATE

In accordance with LifeOS V2.3.0 Rule 9 (Semantic Architecture Invariant) and Section 6 of the Step 3 V2.2 Specification:
1. **Zero String-Guessing / Fallback**: No runtime event fallback or loose string matching is permitted. Any event without an explicit delivery registration triggers a compile-time and static analysis test failure.
2. **Exhaustive Dotted Canonical Names**: Symbolic uppercase aliases (e.g. `TASK_COMPLETED`) are banned at the delivery boundary; all 24 events use the authoritative dotted strings defined in [`CanonicalEventSchemas.ts`](file:///d:/PROGRAMMING/Projects/life-os/packages/execution-kernel/src/events/schemas/CanonicalEventSchemas.ts) and consumed by Step 2 consumers.
3. **Payload Sanitization**: Server-Sent Events frames transmit invalidation metadata and causal tokens only; full entity bodies are excluded to eliminate data leaks and cache desynchronization.

---

## 2. EXHAUSTIVE DISCRIMINATED UNION DEFINITION

```typescript
export type CanonicalEventType =
  // Productivity & Task Lifecycle (6 events)
  | "domain.task.created"
  | "domain.task.completed"
  | "domain.task.uncompleted"
  | "domain.task.updated"
  | "domain.task.deleted"
  | "domain.task.deferred"

  // Goal Intelligence & Trajectory (5 events)
  | "domain.goal.created"
  | "domain.goal.updated"
  | "domain.goal.deleted"
  | "domain.goal.progress_updated"
  | "domain.goal.completed"

  // Temporal Intelligence & Schedules (4 events)
  | "domain.temporal.scheduled"
  | "domain.temporal.rescheduled"
  | "domain.temporal.occurrence_created"
  | "domain.temporal.occurrence_deleted"

  // Physical Readiness & Health (3 events)
  | "domain.health.workout_logged"
  | "domain.physical.session_deleted"
  | "telemetry.wearables.ingested"

  // Analytical & Cognitive Context (3 events)
  | "analytical.schedule.conflict_detected"
  | "observation.cognitive.assessed"
  | "domain.signal.logged"

  // Autonomous Cycle & Governance Auditing (3 events)
  | "autonomous.cycle_evaluated"
  | "autonomous.intervention_triggered"
  | "autonomous.action_executed";
```

---

## 3. THE 24 AUTHORITATIVE CANONICAL EVENT SPECIFICATIONS

| # | Canonical Event Type | Aggregate Type & ID | Category | Required Consumers (Step 2) | Projection Read Models | Surface Invalidation Tags | Publication Eligibility Gate | Replay Policy |
|---|---|---|---|---|---|---|---|---|
| **1** | `domain.task.created` | `task`<br>`taskId` | `DOMAIN_EVENT` | `ExecutionGraphConsumer`,<br>`BehavioralIntelligenceConsumer` | `ExecutionGraphDerivedModel`,<br>`BehavioralPatternModel` | `tasks`, `dashboard` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **2** | `domain.task.completed` | `task`<br>`taskId` | `DOMAIN_EVENT` | `ExecutionGraphConsumer`,<br>`GoalIntelligenceConsumer`,<br>`CadenceLearningConsumer`,<br>`BehavioralIntelligenceConsumer` | `ExecutionGraphDerivedModel`,<br>`GoalStatsModel`,<br>`CadenceProfileModel`,<br>`BehavioralPatternModel` | `tasks`, `dashboard`, `goals`, `learning` | All 4 consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **3** | `domain.task.uncompleted` | `task`<br>`taskId` | `DOMAIN_EVENT` | `ExecutionGraphConsumer`,<br>`GoalIntelligenceConsumer` | `ExecutionGraphDerivedModel`,<br>`GoalStatsModel` | `tasks`, `dashboard`, `goals` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **4** | `domain.task.updated` | `task`<br>`taskId` | `DOMAIN_EVENT` | `ExecutionGraphConsumer` | `ExecutionGraphDerivedModel` | `tasks`, `dashboard` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **5** | `domain.task.deleted` | `task`<br>`taskId` | `DOMAIN_EVENT` | `ExecutionGraphConsumer`,<br>`GoalIntelligenceConsumer` | `ExecutionGraphDerivedModel`,<br>`GoalStatsModel` | `tasks`, `dashboard`, `goals` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **6** | `domain.task.deferred` | `task`<br>`taskId` | `DOMAIN_EVENT` | `BehavioralIntelligenceConsumer` | `BehavioralPatternModel` | `tasks`, `dashboard` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **7** | `domain.goal.created` | `goal`<br>`goalId` | `DOMAIN_EVENT` | `GoalIntelligenceConsumer` | `GoalStatsModel` | `goals`, `dashboard` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **8** | `domain.goal.updated` | `goal`<br>`goalId` | `DOMAIN_EVENT` | `GoalIntelligenceConsumer` | `GoalStatsModel` | `goals`, `dashboard`, `insights` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **9** | `domain.goal.deleted` | `goal`<br>`goalId` | `DOMAIN_EVENT` | `GoalIntelligenceConsumer` | `GoalStatsModel` | `goals`, `dashboard` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **10** | `domain.goal.progress_updated` | `goal`<br>`goalId` | `DOMAIN_EVENT` | `GoalIntelligenceConsumer` | `GoalStatsModel` | `goals`, `dashboard`, `insights` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **11** | `domain.goal.completed` | `goal`<br>`goalId` | `DOMAIN_EVENT` | `GoalIntelligenceConsumer` | `GoalStatsModel` | `goals`, `dashboard`, `insights` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **12** | `domain.temporal.scheduled` | `occurrence`<br>`occurrenceId` | `DOMAIN_EVENT` | `TemporalConflictConsumer`,<br>`CadenceLearningConsumer` | `ScheduleConflictReportModel`,<br>`CadenceProfileModel` | `dashboard`, `surface` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **13** | `domain.temporal.rescheduled` | `occurrence`<br>`occurrenceId` | `DOMAIN_EVENT` | `TemporalConflictConsumer`,<br>`CadenceLearningConsumer` | `ScheduleConflictReportModel`,<br>`CadenceProfileModel` | `dashboard`, `surface` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **14** | `domain.temporal.occurrence_created` | `occurrence`<br>`occurrenceId` | `DOMAIN_EVENT` | `TemporalConflictConsumer` | `ScheduleConflictReportModel` | `dashboard`, `surface` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **15** | `domain.temporal.occurrence_deleted` | `occurrence`<br>`occurrenceId` | `DOMAIN_EVENT` | `TemporalConflictConsumer` | `ScheduleConflictReportModel` | `dashboard`, `surface` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **16** | `domain.health.workout_logged` | `workout`<br>`sessionId` | `DOMAIN_EVENT` | `PhysicalReadinessConsumer`,<br>`CadenceLearningConsumer`,<br>`BehavioralIntelligenceConsumer` | `PhysicalReadinessDerivedModel`,<br>`CadenceProfileModel`,<br>`BehavioralPatternModel` | `world`, `dashboard`, `learning` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **17** | `domain.physical.session_deleted` | `workout`<br>`sessionId` | `DOMAIN_EVENT` | `PhysicalReadinessConsumer` | `PhysicalReadinessDerivedModel` | `world`, `dashboard` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Durable Replay ($\le 50$) |
| **18** | `telemetry.wearables.ingested` | `user`<br>`userId` | `TELEMETRY_EVENT` | `PhysicalReadinessConsumer`,<br>`CognitiveHistoryConsumer` | `PhysicalReadinessDerivedModel`,<br>`CognitiveChronicleModel` | `world`, `dashboard` | All required consumers `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Ephemeral (Drop if disconnected) |
| **19** | `analytical.schedule.conflict_detected` | `occurrence`<br>`conflictId` | `ANALYTICAL_EVENT` | None (Direct Notification) | `ScheduleConflictReportModel` | `dashboard`, `surface`, `assistant` | Outbox status `DELIVERED` | Durable Replay ($\le 50$) |
| **20** | `observation.cognitive.assessed` | `user`<br>`userId` | `OBSERVATION_EVENT` | `CognitiveHistoryConsumer` | `CognitiveChronicleModel` | `world`, `learning` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Ephemeral (Drop if disconnected) |
| **21** | `domain.signal.logged` | `user`<br>`userId` | `DOMAIN_EVENT` | `BehavioralIntelligenceConsumer` | `BehavioralPatternModel` | `insights`, `assistant` | Required consumer `SUCCEEDED` / `SKIPPED_STALE`; outbox `DELIVERED` | Ephemeral (Drop if disconnected) |
| **22** | `autonomous.cycle_evaluated` | `autonomous_cycle`<br>`cycleId` | `SYSTEM_EVENT` | None (Auditing Ledger) | `AutonomousCycleLedger` | `diagnostics` | Outbox status `DELIVERED` | Ephemeral (Drop if disconnected) |
| **23** | `autonomous.intervention_triggered` | `autonomous_intervention`<br>`interventionId` | `SYSTEM_EVENT` | None (Governance Gate) | `ActionPlanModel` | `dashboard`, `diagnostics`, `surface` | Outbox status `DELIVERED` | Durable Replay ($\le 50$) |
| **24** | `autonomous.action_executed` | `autonomous_action`<br>`actionId` | `SYSTEM_EVENT` | None (Auditing Ledger) | `AutonomousExecutionLedgerModel` | `dashboard`, `diagnostics`, `governance` | Outbox status `DELIVERED` | Durable Replay ($\le 50$) |

---

## 4. TYPED CONTRACT & COMPILE-TIME VERIFICATION

```typescript
export interface ICanonicalDeliveryDefinition {
  eventType: CanonicalEventType;
  aggregateType: string;
  aggregateIdField: string;
  category: "DOMAIN_EVENT" | "TELEMETRY_EVENT" | "ANALYTICAL_EVENT" | "SYSTEM_EVENT" | "OBSERVATION_EVENT";
  requiredConsumers: string[];
  projectionDependencies: string[];
  invalidationTags: string[];
  replayable: boolean;
}

export const CANONICAL_DELIVERY_REGISTRY: Record<CanonicalEventType, ICanonicalDeliveryDefinition> = {
  "domain.task.created": {
    eventType: "domain.task.created",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "BehavioralIntelligenceConsumer"],
    projectionDependencies: ["ExecutionGraphDerivedModel", "BehavioralPatternModel"],
    invalidationTags: ["tasks", "dashboard"],
    replayable: true,
  },
  "domain.task.completed": {
    eventType: "domain.task.completed",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "GoalIntelligenceConsumer", "CadenceLearningConsumer", "BehavioralIntelligenceConsumer"],
    projectionDependencies: ["ExecutionGraphDerivedModel", "GoalStatsModel", "CadenceProfileModel", "BehavioralPatternModel"],
    invalidationTags: ["tasks", "dashboard", "goals", "learning"],
    replayable: true,
  },
  "domain.task.uncompleted": {
    eventType: "domain.task.uncompleted",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "GoalIntelligenceConsumer"],
    projectionDependencies: ["ExecutionGraphDerivedModel", "GoalStatsModel"],
    invalidationTags: ["tasks", "dashboard", "goals"],
    replayable: true,
  },
  "domain.task.updated": {
    eventType: "domain.task.updated",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer"],
    projectionDependencies: ["ExecutionGraphDerivedModel"],
    invalidationTags: ["tasks", "dashboard"],
    replayable: true,
  },
  "domain.task.deleted": {
    eventType: "domain.task.deleted",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["ExecutionGraphConsumer", "GoalIntelligenceConsumer"],
    projectionDependencies: ["ExecutionGraphDerivedModel", "GoalStatsModel"],
    invalidationTags: ["tasks", "dashboard", "goals"],
    replayable: true,
  },
  "domain.task.deferred": {
    eventType: "domain.task.deferred",
    aggregateType: "task",
    aggregateIdField: "taskId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["BehavioralIntelligenceConsumer"],
    projectionDependencies: ["BehavioralPatternModel"],
    invalidationTags: ["tasks", "dashboard"],
    replayable: true,
  },
  "domain.goal.created": {
    eventType: "domain.goal.created",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"],
    projectionDependencies: ["GoalStatsModel"],
    invalidationTags: ["goals", "dashboard"],
    replayable: true,
  },
  "domain.goal.updated": {
    eventType: "domain.goal.updated",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"],
    projectionDependencies: ["GoalStatsModel"],
    invalidationTags: ["goals", "dashboard", "insights"],
    replayable: true,
  },
  "domain.goal.deleted": {
    eventType: "domain.goal.deleted",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"],
    projectionDependencies: ["GoalStatsModel"],
    invalidationTags: ["goals", "dashboard"],
    replayable: true,
  },
  "domain.goal.progress_updated": {
    eventType: "domain.goal.progress_updated",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"],
    projectionDependencies: ["GoalStatsModel"],
    invalidationTags: ["goals", "dashboard", "insights"],
    replayable: true,
  },
  "domain.goal.completed": {
    eventType: "domain.goal.completed",
    aggregateType: "goal",
    aggregateIdField: "goalId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["GoalIntelligenceConsumer"],
    projectionDependencies: ["GoalStatsModel"],
    invalidationTags: ["goals", "dashboard", "insights"],
    replayable: true,
  },
  "domain.temporal.scheduled": {
    eventType: "domain.temporal.scheduled",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer", "CadenceLearningConsumer"],
    projectionDependencies: ["ScheduleConflictReportModel", "CadenceProfileModel"],
    invalidationTags: ["dashboard", "surface"],
    replayable: true,
  },
  "domain.temporal.rescheduled": {
    eventType: "domain.temporal.rescheduled",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer", "CadenceLearningConsumer"],
    projectionDependencies: ["ScheduleConflictReportModel", "CadenceProfileModel"],
    invalidationTags: ["dashboard", "surface"],
    replayable: true,
  },
  "domain.temporal.occurrence_created": {
    eventType: "domain.temporal.occurrence_created",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer"],
    projectionDependencies: ["ScheduleConflictReportModel"],
    invalidationTags: ["dashboard", "surface"],
    replayable: true,
  },
  "domain.temporal.occurrence_deleted": {
    eventType: "domain.temporal.occurrence_deleted",
    aggregateType: "occurrence",
    aggregateIdField: "occurrenceId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["TemporalConflictConsumer"],
    projectionDependencies: ["ScheduleConflictReportModel"],
    invalidationTags: ["dashboard", "surface"],
    replayable: true,
  },
  "domain.health.workout_logged": {
    eventType: "domain.health.workout_logged",
    aggregateType: "workout",
    aggregateIdField: "sessionId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["PhysicalReadinessConsumer", "CadenceLearningConsumer", "BehavioralIntelligenceConsumer"],
    projectionDependencies: ["PhysicalReadinessDerivedModel", "CadenceProfileModel", "BehavioralPatternModel"],
    invalidationTags: ["world", "dashboard", "learning"],
    replayable: true,
  },
  "domain.physical.session_deleted": {
    eventType: "domain.physical.session_deleted",
    aggregateType: "workout",
    aggregateIdField: "sessionId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["PhysicalReadinessConsumer"],
    projectionDependencies: ["PhysicalReadinessDerivedModel"],
    invalidationTags: ["world", "dashboard"],
    replayable: true,
  },
  "telemetry.wearables.ingested": {
    eventType: "telemetry.wearables.ingested",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "TELEMETRY_EVENT",
    requiredConsumers: ["PhysicalReadinessConsumer", "CognitiveHistoryConsumer"],
    projectionDependencies: ["PhysicalReadinessDerivedModel", "CognitiveChronicleModel"],
    invalidationTags: ["world", "dashboard"],
    replayable: false,
  },
  "analytical.schedule.conflict_detected": {
    eventType: "analytical.schedule.conflict_detected",
    aggregateType: "occurrence",
    aggregateIdField: "conflictId",
    category: "ANALYTICAL_EVENT",
    requiredConsumers: [],
    projectionDependencies: ["ScheduleConflictReportModel"],
    invalidationTags: ["dashboard", "surface", "assistant"],
    replayable: true,
  },
  "observation.cognitive.assessed": {
    eventType: "observation.cognitive.assessed",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "OBSERVATION_EVENT",
    requiredConsumers: ["CognitiveHistoryConsumer"],
    projectionDependencies: ["CognitiveChronicleModel"],
    invalidationTags: ["world", "learning"],
    replayable: false,
  },
  "domain.signal.logged": {
    eventType: "domain.signal.logged",
    aggregateType: "user",
    aggregateIdField: "userId",
    category: "DOMAIN_EVENT",
    requiredConsumers: ["BehavioralIntelligenceConsumer"],
    projectionDependencies: ["BehavioralPatternModel"],
    invalidationTags: ["insights", "assistant"],
    replayable: false,
  },
  "autonomous.cycle_evaluated": {
    eventType: "autonomous.cycle_evaluated",
    aggregateType: "autonomous_cycle",
    aggregateIdField: "cycleId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [],
    projectionDependencies: ["AutonomousCycleLedger"],
    invalidationTags: ["diagnostics"],
    replayable: false,
  },
  "autonomous.intervention_triggered": {
    eventType: "autonomous.intervention_triggered",
    aggregateType: "autonomous_intervention",
    aggregateIdField: "interventionId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [],
    projectionDependencies: ["ActionPlanModel"],
    invalidationTags: ["dashboard", "diagnostics", "surface"],
    replayable: true,
  },
  "autonomous.action_executed": {
    eventType: "autonomous.action_executed",
    aggregateType: "autonomous_action",
    aggregateIdField: "actionId",
    category: "SYSTEM_EVENT",
    requiredConsumers: [],
    projectionDependencies: ["AutonomousExecutionLedgerModel"],
    invalidationTags: ["dashboard", "diagnostics", "governance"],
    replayable: true,
  },
};
```
