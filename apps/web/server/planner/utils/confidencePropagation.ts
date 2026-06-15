/**
 * Centralized Confidence Propagation Utility
 *
 * PROBLEM SOLVED:
 * Every analyzer was independently inventing confidence multiplication formulas.
 * This created: inconsistent semantics, impossible calibration, unstable planner confidence.
 *
 * SOLUTION:
 * All final planner confidence values are computed here.
 * Analyzers output raw signals (patternStrength, sampleSupport).
 * Orchestrators call propagateConfidence() to derive final confidence.
 *
 * DESIGN PRINCIPLES:
 * - No formula is hardcoded. Callers provide component weights.
 * - All outputs are clamped to [0, cap].
 * - Output is fully explainable (breakdown returned).
 * - Uncertainty-preserving: sparse data → lower confidence, not fake precision.
 * - Caps are enforced per analyzer domain to prevent overconfidence.
 *
 * USAGE:
 *   const result = propagateConfidence({
 *     components: [
 *       { name: "patternStrength",  value: 0.8,  weight: 0.4 },
 *       { name: "sampleSupport",    value: 0.6,  weight: 0.3 },
 *       { name: "reliabilityScore", value: 0.7,  weight: 0.2 },
 *       { name: "temporalSpread",   value: 0.5,  weight: 0.1 },
 *     ],
 *     cap: 0.85,
 *     label: "taskDensity",
 *   });
 *   // → { finalConfidence: 0.XX, breakdown: {...}, appliedCap: 0.85 }
 */

export interface ConfidenceComponent {
  name: string;
  /** Raw value 0–1. Will be clamped. */
  value: number;
  /** Relative weight. Weights are normalised internally. */
  weight: number;
}

export interface ConfidencePropagationResult {
  finalConfidence: number;
  /** Per-component weighted contributions for explainability. */
  breakdown: Record<string, { raw: number; weight: number; contribution: number }>;
  appliedCap: number;
  /** True if any component was below 0.2, indicating weak signal. */
  hasWeakSignal: boolean;
  /** True if confidence was capped. */
  wasCapped: boolean;
}

/**
 * Propagates a set of confidence components into a single final confidence value.
 *
 * Formula: finalConfidence = Σ(component_i.value × normalised_weight_i)
 * This is a weighted average — not a multiplicative chain.
 *
 * MULTIPLICATIVE CHAIN is intentionally avoided:
 * - In a chain, one low-value component drives the entire result to near-zero.
 * - This produces fake precision (e.g. 0.8 × 0.6 × 0.5 = 0.24 regardless of which
 *   component is strong).
 * - Weighted average preserves the relative contributions and is easier to calibrate.
 *
 * WHEN TO USE MULTIPLICATIVE PENALTY INSTEAD:
 * - For reliability dampening only (one global multiplier after the weighted sum).
 * - Use the `penaltyMultiplier` parameter for this.
 */
export function propagateConfidence(params: {
  components: ConfidenceComponent[];
  cap: number;
  label?: string;
  /** Optional global dampener applied after weighted sum (e.g. reliabilityScore). */
  penaltyMultiplier?: number;
}): ConfidencePropagationResult {
  const { components, cap, penaltyMultiplier = 1.0 } = params;

  if (components.length === 0) {
    return {
      finalConfidence: 0,
      breakdown: {},
      appliedCap: cap,
      hasWeakSignal: true,
      wasCapped: false,
    };
  }

  // Normalise weights
  const totalWeight = components.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (totalWeight === 0) {
    return {
      finalConfidence: 0,
      breakdown: {},
      appliedCap: cap,
      hasWeakSignal: true,
      wasCapped: false,
    };
  }

  const breakdown: Record<string, { raw: number; weight: number; contribution: number }> = {};
  let weightedSum = 0;
  let hasWeakSignal = false;

  for (const c of components) {
    const raw = Math.max(0, Math.min(1, c.value));
    const normWeight = c.weight / totalWeight;
    const contribution = raw * normWeight;
    weightedSum += contribution;
    breakdown[c.name] = { raw, weight: normWeight, contribution };
    if (raw < 0.2) hasWeakSignal = true;
  }

  // Apply optional global reliability multiplier AFTER weighted sum
  const dampened = weightedSum * Math.max(0, Math.min(1, penaltyMultiplier));

  // Apply domain cap
  const capped = Math.min(dampened, cap);
  const wasCapped = capped < dampened;

  return {
    finalConfidence: Number(capped.toFixed(4)),
    breakdown,
    appliedCap: cap,
    hasWeakSignal,
    wasCapped,
  };
}

/**
 * Quick helper for the common 3-component case:
 * patternStrength × sampleSupport dampened by reliabilityScore, capped at cap.
 */
export function basicConfidence(
  patternStrength: number,
  sampleSupport: number,
  reliabilityScore: number,
  cap: number,
  label?: string
): number {
  return propagateConfidence({
    components: [
      { name: "patternStrength", value: patternStrength, weight: 0.5 },
      { name: "sampleSupport",   value: sampleSupport,   weight: 0.5 },
    ],
    cap,
    label,
    penaltyMultiplier: reliabilityScore,
  }).finalConfidence;
}

/**
 * Signal consistency score: how much do multiple analyzers agree?
 * Returns 1 if all values are the same, 0 if maximally spread.
 *
 * Used by orchestrators to detect contradictory analyzer outputs.
 */
export function signalConsistency(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  // Map variance [0, 0.25] → consistency [1, 0]
  // Max possible variance for values in [0,1] is 0.25
  return Math.max(0, 1 - variance / 0.25);
}
