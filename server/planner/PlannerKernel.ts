// ═══════════════════════════════════════════════════════════════════════════════
// PLANNER KERNEL — Deterministic Orchestration Substrate
// ═══════════════════════════════════════════════════════════════════════════════
//
// The Planner Kernel is the authoritative architectural boundary for all
// deterministic scheduling, chunking, propagation, and repair logic in LifeOS.
//
// ── KERNEL INVARIANTS ─────────────────────────────────────────────────────────
//
// The following invariants MUST be preserved by all code inside this boundary.
// They are future runtime enforcement targets — currently documented here as
// architectural contracts:
//
//   1. DETERMINISM
//      All kernel outputs are deterministic given identical inputs + logicalTick.
//      The same input state always produces byte-identical output.
//
//   2. NO WALL-CLOCK TIME
//      Date.now(), new Date(), or any wall-clock source is PROHIBITED inside
//      the kernel boundary. All temporal progression uses logicalTick.
//
//   3. DAG POST-CONDITIONS
//      All chunk dependency graphs must satisfy acyclicity before leaving any
//      kernel function. validateAcyclicGraph() is the enforcement mechanism.
//
//   4. STRUCTURED REASONING
//      All kernel operations must emit reasoning metadata. Currently string[],
//      evolving toward PlannerReasoningEvent (see types/PlannerSemantics.ts).
//
//   5. NO STOCHASTIC BEHAVIOR
//      No probabilistic inference, ML model calls, or hidden mutable state.
//      Risk scores are deterministic heuristic aggregates, not probabilities.
//
//   6. SAME-TICK ORDERING (REPLAY CONSTITUTION)
//      PLANNER_EVENT_SAME_TICK_PRECEDENCE is the authoritative event ordering
//      table for the simulation layer. Any new PlannerEventType MUST be
//      explicitly positioned within that array before it can be legally used
//      in simulation. Violation causes silent replay divergence across runs.
//      Reference: server/planner/types/PlannerEventTypes.ts
//
//   7. REPLAY INTEGRITY
//      Replaying an ExecutionTrace from (initialState + events) must produce
//      a terminal topology hash byte-identical to the original simulation.
//      This is the primary correctness guarantee of the simulation layer.
//      It must be verified by test-phase4-simulation.ts Test 7 on every build.
//      Reference: server/planner/simulation/simulateExecutionDay.ts
//
// ── OUTER LAYERS ──────────────────────────────────────────────────────────────
//
// The following systems MAY depend on the kernel. Reverse dependencies
// (kernel depending on outer layers) are PROHIBITED:
//
//   - REST API handlers and route controllers
//   - UI/client adapters and data transformers
//   - ML advisory systems (read-only inputs TO the kernel, never dependencies)
//   - Analytics and observability pipelines
//   - Personalization and preference engines
//   - Notification and event dispatch systems
//
// The kernel is an architectural ownership boundary — NOT a runtime singleton,
// dependency injector, mutable state container, or execution coordinator.
//
// ── KERNEL SUBSYSTEMS ─────────────────────────────────────────────────────────
//
//   chunking/     — Dynamic task fragmentation and chunk topology
//   scheduling/   — Candidate placement generation and schedule selection
//   replanning/   — Incremental repair and execution drift response
//   validation/   — DAG safety enforcement and constraint propagation
//   types/        — Canonical type contracts and semantic definitions
//   utils/        — Shared deterministic utilities (TemporalWindow, etc.)
//   normalization/ — Wall-clock → planner-relative translation boundary
//   simulation/   — Deterministic execution harness + repair convergence
//   observability/ — Topology diff, causal replay, displacement explanation
//
// ═══════════════════════════════════════════════════════════════════════════════

// Chunking subsystem
export { generateTaskChunks } from "./chunking/generateTaskChunks";
export { optimizeScheduleTopology } from "./chunking/optimizeScheduleTopology";

// Scheduling subsystem
export { generateCandidateSchedules } from "./scheduling/generateCandidateSchedules";

// Replanning subsystem
export { generateIncrementalRepairPlan } from "./replanning/generateIncrementalRepairPlan";

// Validation subsystem
export { propagateTemporalConstraints } from "./validation/propagateTemporalConstraints";
export { validateAcyclicGraph } from "./validation/validateAcyclicGraph";

// Canonical semantic contracts
export type { PlannerReasoningEvent, PlannerDeadlineBoundary } from "./types/PlannerSemantics";
export { PLANNER_CONFIDENCE_SEMANTICS, PLANNER_STABILITY_RISK_SEMANTICS } from "./types/PlannerSemantics";

// Simulation subsystem
export { simulateExecutionDay } from "./simulation/simulateExecutionDay";
export { verifyRepairConvergence } from "./simulation/verifyRepairConvergence";
export { applyPlannerEvent } from "./simulation/applyPlannerEvent";

// Observability subsystem
export { projectTopology } from "./observability/projectTopology";
export type { CanonicalTopologyProjection } from "./observability/projectTopology";

// Replay constitution — see Invariant 6 above
export { PLANNER_EVENT_SAME_TICK_PRECEDENCE, sortPlannerEvents } from "./types/PlannerEventTypes";
