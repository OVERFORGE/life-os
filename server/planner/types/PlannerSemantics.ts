// ═══════════════════════════════════════════════════════════════════════════════
// PLANNER SEMANTICS — Canonical Semantic Contracts
//
// This file is the authoritative definition source for planner-wide semantic
// concepts. It contains ONLY:
//   - Canonical constant definitions (documentation anchors)
//   - Interface stubs marking future evolution boundaries
//   - Cross-subsystem semantic contracts
//
// DO NOT add:
//   - Runtime logic or utility functions
//   - Validation helpers or orchestration code
//   - Mutable state or execution dependencies
//
// This file must remain behaviorally inert — it is a semantic authority, not a
// service layer. All other planner files reference this as their source of truth.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Confidence ────────────────────────────────────────────────────────────────

/**
 * Canonical planner-wide definition of `confidence`.
 *
 * confidence ∈ [0.0, 1.0]
 *
 * Measures the deterministic trustworthiness of planner inputs, constraint
 * integrity, and evaluation completeness — NOT probability of success.
 *
 * Interpretation:
 *   1.0  = all inputs structurally complete and internally consistent
 *   0.75 = minor gaps in input data; planner can proceed with degraded precision
 *   0.5  = significant missing or conflicting input data; outputs are advisory
 *   <0.5 = insufficient data to produce reliable placement decisions
 *   0.0  = no usable input data; output should not be acted upon
 *
 * Confidence is NOT:
 *   - A probability of task completion
 *   - A prediction of user adherence
 *   - A stochastic estimate of future outcomes
 *
 * All subsystems (placements, schedules, signals, repairs) share this definition.
 */
export const PLANNER_CONFIDENCE_SEMANTICS = `
confidence ∈ [0,1] measures deterministic trustworthiness of planner inputs,
constraint integrity, and evaluation completeness — NOT probability of success.
` as const;

// ── Stability Risk Score ───────────────────────────────────────────────────────

/**
 * Canonical planner-wide definition of `stabilityRiskScore`.
 *
 * stabilityRiskScore ∈ [0.0, 1.0]
 *
 * A deterministic heuristic aggregate measuring the structural pressure on
 * the schedule topology — NOT a statistical failure probability.
 *
 * Interpretation:
 *   0.0  = no meaningful instability pressure
 *   0.25 = minor signals; monitoring recommended
 *   0.5  = moderate pressure; repair recommended before next cycle
 *   0.75 = high pressure; immediate repair strongly advised
 *   1.0  = critical instability; schedule is likely to fail without intervention
 *
 * stabilityRiskScore is NOT:
 *   - A machine learning output
 *   - A probability distribution
 *   - A confidence interval bound
 *
 * It is a bounded, interpretable, deterministic heuristic.
 */
export const PLANNER_STABILITY_RISK_SEMANTICS = `
stabilityRiskScore ∈ [0,1] is a deterministic heuristic aggregate measuring
structural schedule pressure — NOT a statistical failure probability.
` as const;

// ── Future Evolution Boundaries ───────────────────────────────────────────────

/**
 * PlannerReasoningEvent — Structured planner reasoning (future evolution stub).
 *
 * TODO: Replace `reasoning: string[]` throughout all planner subsystems with
 * PlannerReasoningEvent[] when reasoning must become:
 *   - queryable by code or severity
 *   - filterable per subsystem
 *   - weightable for explainability scoring
 *   - localizable for internationalized UI output
 *
 * DO NOT migrate existing `reasoning: string[]` fields until:
 *   1. Deterministic topology and repair correctness are fully stabilized
 *   2. A structured reasoning consumer (UI or analytics) actually requires it
 *   3. The migration can be done as a single coordinated pass
 *
 * Current `reasoning: string[]` usage is acceptable for this maturity level.
 */
export interface PlannerReasoningEvent {
  /** Machine-readable event code for querying/filtering */
  code: string;
  /** Human-readable explanation */
  message: string;
  /** Severity classification */
  severity: "info" | "warning" | "critical";
  /** Subsystem that emitted this event */
  sourceSystem: string;
}

/**
 * PlannerDeadlineBoundary — Multi-day deadline evolution target (future stub).
 *
 * TODO: Replace `hardDeadlineMinute?: number` with PlannerDeadlineBoundary
 * when multi-day orchestration, rolling replanning, or overnight scheduling arrives.
 *
 * hardDeadlineMinute is only valid within a single orchestration horizon (one day).
 * PlannerDeadlineBoundary adds an explicit dayOffset so the kernel can safely
 * compare and schedule across multiple days without horizon ambiguity.
 *
 * DO NOT implement until multi-day orchestration is actively required.
 */
export interface PlannerDeadlineBoundary {
  /** Day offset from the active orchestration horizon: 0 = current day, 1 = next day */
  horizonDayOffset: number;
  /** Minute within that day [0–1439] */
  minuteWithinDay: number;
}
