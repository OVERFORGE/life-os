import { CandidatePlacement, PlacementAnalysisContext, SchedulableUnit } from "../types/SchedulingTypes";
import { calculateTemporalOverlap, temporalWindowContains, tryCreateTemporalWindow } from "../utils/TemporalWindow";

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateCandidatePlacement(
  placement: CandidatePlacement,
  task: SchedulableUnit,
  context: PlacementAnalysisContext
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  const addError = (code: string, message: string) => {
    result.errors.push({ code, message });
    result.valid = false;
  };

  const addWarning = (code: string, message: string) => {
    result.warnings.push({ code, message });
  };

  // 1. Temporal Validity
  if (!placement.temporalWindow) {
    addError("MISSING_TEMPORAL_WINDOW", "Placement is missing temporalWindow property.");
    return result; // Can't proceed safely without a window
  }

  // tryCreateTemporalWindow returns TemporalWindow | null
  const revalidatedWindow = tryCreateTemporalWindow(
    placement.temporalWindow.startMinute,
    placement.temporalWindow.endMinute
  );
  if (!revalidatedWindow) {
    addError(
      "CORRUPTED_TEMPORAL_WINDOW",
      `Invalid window topology: [${placement.temporalWindow.startMinute}, ${placement.temporalWindow.endMinute})`
    );
    return result;
  }

  if (placement.temporalWindow.durationMinutes <= 0) {
    addError("INVALID_DURATION", `Invalid non-positive duration: ${placement.temporalWindow.durationMinutes}`);
  }

  if (placement.temporalWindow.durationMinutes !== task.estimatedDurationMinutes) {
    addError("DURATION_MISMATCH", `Placement duration (${placement.temporalWindow.durationMinutes}) does not match task duration (${task.estimatedDurationMinutes})`);
  }

  // 2. Availability Containment
  const fitsInAvailability = context.availabilityWindows.some(avail => {
    if (!avail.daysOfWeek.includes(placement.dayOfWeek)) return false;
    return temporalWindowContains(avail.window, placement.temporalWindow);
  });

  if (!fitsInAvailability) {
    addError("PLACEMENT_OUTSIDE_AVAILABILITY", "Placement is not contained within any valid availability window for the given day");
  }

  // 3. Hard Constraint Rejection
  // System Hard Constraints
  for (const constraint of context.recurringConstraints) {
    if (!constraint.daysOfWeek.includes(placement.dayOfWeek)) continue;
    
    if (constraint.constraintType === "hard") {
      const overlap = calculateTemporalOverlap(placement.temporalWindow, constraint.window).overlapMinutes;
      if (overlap > 0) {
        addError("HARD_CONSTRAINT_OVERLAP", "Overlap with system hard constraint");
      }
    }
  }

  // Task Hard Constraints
  if (task.hardConstraints && task.hardConstraints.length > 0) {
    for (const hc of task.hardConstraints) {
      const overlap = calculateTemporalOverlap(placement.temporalWindow, hc).overlapMinutes;
      if (overlap > 0) {
        addError("TASK_HARD_CONSTRAINT_OVERLAP", "Overlap with task-specific hard constraint");
      }
    }
  }

  // 4. Score Finite-ness + Range Correctness
  if (!Number.isFinite(placement.placementScore)) {
    addError("NON_FINITE_SCORE", `placementScore is not a finite number: ${placement.placementScore}`);
  } else if (placement.placementScore < 0 || placement.placementScore > 1) {
    addError("INVALID_SCORE_BOUNDS", `placementScore must be within [0,1], got ${placement.placementScore}`);
  }
  
  if (!Number.isFinite(placement.confidence)) {
    addError("NON_FINITE_CONFIDENCE", `confidence is not a finite number: ${placement.confidence}`);
  } else if (placement.confidence < 0 || placement.confidence > 1) {
    addError("INVALID_CONFIDENCE_BOUNDS", `confidence must be within [0,1], got ${placement.confidence}`);
  }
  
  if (!Number.isFinite(placement.stabilityScore)) {
    addError("NON_FINITE_STABILITY", `stabilityScore is not a finite number: ${placement.stabilityScore}`);
  } else if (placement.stabilityScore < 0 || placement.stabilityScore > 1) {
    addError("INVALID_STABILITY_BOUNDS", `stabilityScore must be within [0,1], got ${placement.stabilityScore}`);
  }

  // 5. Explainability Integrity
  const checkStringArray = (arr: any[], fieldName: string) => {
    if (!Array.isArray(arr)) {
      addError("INVALID_EXPLAINABILITY_TYPE", `${fieldName} is not an array`);
      return false;
    }
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== "string") {
        addError("INVALID_EXPLAINABILITY_TYPE", `${fieldName} contains non-string elements`);
        return false;
      }
      if (arr[i].trim() === "") {
        addError("EMPTY_EXPLAINABILITY_STRING", `${fieldName} contains empty strings`);
        return false;
      }
    }
    if (new Set(arr).size !== arr.length) {
      addWarning("DUPLICATE_EXPLAINABILITY", `Duplicate entries found in ${fieldName}`);
    }
    return true;
  };

  if (!placement.penaltiesApplied || !placement.boostsApplied || !placement.blockingReasons || !placement.reasoning) {
    addError("MISSING_EXPLAINABILITY", "Missing explainability arrays");
  } else {
    checkStringArray(placement.penaltiesApplied, "penaltiesApplied");
    checkStringArray(placement.boostsApplied, "boostsApplied");
    checkStringArray(placement.blockingReasons, "blockingReasons");
    const reasoningValid = checkStringArray(placement.reasoning, "reasoning");
    
    if (reasoningValid && result.valid && placement.reasoning.length === 0) {
      addError("EMPTY_REASONING_FOR_VALID_PLACEMENT", "Valid placements must contain at least one reasoning entry explaining the placement decision");
    }
  }

  return result;
}
