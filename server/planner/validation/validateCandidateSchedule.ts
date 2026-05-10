import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { PlacementAnalysisContext } from "../types/SchedulingTypes";
import { temporalWindowsIntersect } from "../utils/TemporalWindow";
import { validateCandidatePlacement, ValidationIssue } from "./validateCandidatePlacement";

// ─────────────────────────────────────────────────────────────────────────────
// validateCandidateSchedule
//
// Schedule-level safety boundary. Analogous to validateCandidatePlacement
// but operating on an entire CandidateSchedule.
//
// GUARANTEE: This function never throws. It always returns a structured result.
// GUARANTEE: Callers must never assume a schedule is valid without calling this.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateCandidateSchedule(
  schedule: CandidateSchedule,
  context: PlacementAnalysisContext
): ScheduleValidationResult {
  const result: ScheduleValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const addError = (code: string, message: string) => {
    result.errors.push({ code, message });
    result.valid = false;
  };

  const addWarning = (code: string, message: string) => {
    result.warnings.push({ code, message });
  };

  // 1. Schedule-level score finite-ness + bounds
  const scores: Array<{ field: string; value: number }> = [
    { field: "scheduleScore", value: schedule.scheduleScore },
    { field: "stabilityScore", value: schedule.stabilityScore },
    { field: "focusScore", value: schedule.focusScore },
    { field: "fragmentationScore", value: schedule.fragmentationScore },
    { field: "recoverySafetyScore", value: schedule.recoverySafetyScore },
    { field: "coverageRatio", value: schedule.coverageRatio },
    { field: "confidence", value: schedule.confidence },
  ];

  for (const { field, value } of scores) {
    if (!Number.isFinite(value)) {
      addError(
        "NON_FINITE_SCHEDULE_SCORE",
        `${field} is not a finite number: ${value}`
      );
    } else if (value < 0 || value > 1) {
      addError(
        "INVALID_SCHEDULE_SCORE_BOUNDS",
        `${field} must be within [0,1], got ${value}`
      );
    }
  }

  // 2. No two scheduled placements may overlap
  const placements = schedule.scheduledPlacements;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i].placement.temporalWindow;
      const b = placements[j].placement.temporalWindow;
      if (temporalWindowsIntersect(a, b)) {
        addError(
          "OVERLAPPING_SCHEDULED_PLACEMENTS",
          `Scheduled placements for tasks '${placements[i].task.id}' and '${placements[j].task.id}' overlap`
        );
      }
    }
  }

  // 2b. Topological dependencies must be respected
  if (context.reverseDependencyGraph) {
    for (const sp of placements) {
      const parents = context.reverseDependencyGraph.get(sp.task.id) || [];
      for (const parentId of parents) {
        const parentPlacement = placements.find(p => p.task.id === parentId);
        if (!parentPlacement) {
          addError(
            "ORPHANED_CHUNK_DEPENDENCY",
            `Child chunk '${sp.task.id}' is scheduled, but parent chunk '${parentId}' is missing.`
          );
        } else {
          // Check start >= parent.end
          // Avoiding midnight crossover logic for simplicity here, just doing basic check
          if (sp.placement.temporalWindow.startMinute < parentPlacement.placement.temporalWindow.endMinute &&
              parentPlacement.placement.temporalWindow.startMinute < parentPlacement.placement.temporalWindow.endMinute &&
              sp.placement.temporalWindow.startMinute < sp.placement.temporalWindow.endMinute) {
             addError(
               "TOPOLOGICAL_DEPENDENCY_VIOLATION",
               `Child chunk '${sp.task.id}' starts before parent chunk '${parentId}' ends.`
             );
          }
        }
      }
    }
  }

  // 3. All individual placements must pass single-task validation
  for (const sp of placements) {
    const placementValidation = validateCandidatePlacement(
      sp.placement,
      sp.task,
      context
    );
    if (!placementValidation.valid) {
      addError(
        "INVALID_PLACEMENT_IN_SCHEDULE",
        `Task '${sp.task.id}' has an invalid placement: ${placementValidation.errors.map((e) => e.code).join(", ")}`
      );
    }
    for (const w of placementValidation.warnings) {
      addWarning(w.code, `Task '${sp.task.id}': ${w.message}`);
    }
  }

  // 4. Explainability integrity
  if (!Array.isArray(schedule.reasoning) || schedule.reasoning.length === 0) {
    addError(
      "MISSING_SCHEDULE_REASONING",
      "Schedule must contain at least one reasoning entry"
    );
  } else {
    for (const entry of schedule.reasoning) {
      if (typeof entry !== "string" || entry.trim() === "") {
        addError(
          "EMPTY_SCHEDULE_REASONING_ENTRY",
          "Schedule reasoning contains an empty string"
        );
        break;
      }
    }
  }

  // 5. Coverage ratio consistency
  const totalTasks =
    placements.length + schedule.unscheduledTaskIds.length;
  if (totalTasks > 0) {
    const expectedCoverage = placements.length / totalTasks;
    const diff = Math.abs(schedule.coverageRatio - expectedCoverage);
    if (diff > 0.001) {
      addWarning(
        "COVERAGE_RATIO_MISMATCH",
        `coverageRatio (${schedule.coverageRatio}) does not match computed ratio (${expectedCoverage.toFixed(3)})`
      );
    }
  }

  // 6. Conflict records structural validity
  for (const conflict of schedule.conflicts) {
    if (!conflict.winnerTaskId || !conflict.loserTaskId) {
      addError(
        "INVALID_CONFLICT_RECORD",
        "ScheduleConflict is missing winnerTaskId or loserTaskId"
      );
    }
    if (!Number.isFinite(conflict.overlapMinutes) || conflict.overlapMinutes <= 0) {
      addError(
        "INVALID_CONFLICT_OVERLAP",
        `ScheduleConflict has invalid overlapMinutes: ${conflict.overlapMinutes}`
      );
    }
  }

  return result;
}
