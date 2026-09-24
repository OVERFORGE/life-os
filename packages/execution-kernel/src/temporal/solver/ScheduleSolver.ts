/**
 * ScheduleSolver.ts
 * 
 * Deterministic Temporal Reality & Schedule Solver (V3).
 * 
 * Invariants:
 * - Guardrail 6: Mandatory transition buffers between distinct physical locations;
 *   ZERO artificial buffer for HOME -> HOME or VIRTUAL -> VIRTUAL.
 * - Guardrail 7: Pure deterministic infrastructure; human preferences and cadence
 *   arrive through structured inputs.
 * - Guardrail 8: Continuous suitability model with clear separation between hard
 *   constraints (collision, unmovable anchors) and soft preferences.
 * - Zero LLM or regex dependencies. 100% replayable.
 */

import {
  TemporalInterval,
  TemporalOccurrence,
  StructuredLocationContext,
  DayCadenceProfile,
} from "../contracts/TemporalContracts";
import {
  normalizeTemporalInterval,
  doIntervalsOverlap,
  minutesToTimeString,
} from "../normalization/temporalNormalizer";

export interface SolverSlotCandidate {
  dateOnly: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  interval: TemporalInterval;
  suitabilityScore: number;       // 0 - 100
  collisionDetected: boolean;
  collidingOccurrenceIds: string[];
  transitionBufferRequiredMinutes: number;
  transitionBufferSatisfied: boolean;
  explanation: string;
}

export interface SolverPlacementRequest {
  dateOnly: string;
  idealStartMinute: number;
  durationMinutes: number;
  timezone?: string;
  locationContext?: StructuredLocationContext;
  rigidity?: "UNMOVABLE" | "ELASTIC" | "OPTIONAL";
  existingOccurrences: TemporalOccurrence[];
  cadenceProfile?: DayCadenceProfile;
  allowLocalRepair?: boolean;     // If true, finds closest feasible slot on conflict
  activityType?: "workout" | "work_session" | "routine" | "general";
  operationalConstraints?: {
    suppressWorkouts?: boolean;
    maxWorkloadHoursPerDay?: number;
    activeContextMode?: "sprint" | "sanctuary" | "sabbatical" | "standard";
  };
  isUserExplicitOverride?: boolean;
}

export interface SolverPlacementResult {

  feasible: boolean;
  selectedSlot?: SolverSlotCandidate;
  repairAttempted: boolean;
  alternativeCandidates: SolverSlotCandidate[];
  reason?: string;
}

export class ScheduleSolver {
  private static instance: ScheduleSolver;

  static getInstance(): ScheduleSolver {
    if (!ScheduleSolver.instance) {
      ScheduleSolver.instance = new ScheduleSolver();
    }
    return ScheduleSolver.instance;
  }

  /**
   * Computes mandatory physical transition buffer between two activities.
   * Enforces Guardrail 6:
   * - ZERO penalty for VIRTUAL -> VIRTUAL or HOME -> HOME
   * - Transition buffer when physical travel or preparation is required
   */
  computeTransitionBufferMinutes(
    fromLoc?: StructuredLocationContext,
    toLoc?: StructuredLocationContext,
    defaultBufferMinutes: number = 20
  ): number {
    if (!fromLoc || !toLoc) {
      return 0; // Unknown spatial requirements
    }

    // Virtual sessions have no physical transit
    if (fromLoc.category === "VIRTUAL" || toLoc.category === "VIRTUAL") {
      return 0;
    }

    // Both at home
    if (fromLoc.category === "HOME" && toLoc.category === "HOME") {
      return 0;
    }


    // Identical specific place identifier
    if (
      fromLoc.customIdentifier &&
      toLoc.customIdentifier &&
      fromLoc.customIdentifier === toLoc.customIdentifier
    ) {
      return 0;
    }

    // Identical place label
    if (
      fromLoc.label &&
      toLoc.label &&
      fromLoc.label.trim().toLowerCase() === toLoc.label.trim().toLowerCase()
    ) {
      return 0;
    }

    // Different physical locations require transition/commute buffer
    return defaultBufferMinutes;
  }

  /**
   * Evaluates a specific candidate interval against existing scheduled occurrences
   */
  evaluateCandidateSlot(
    dateOnly: string,
    startMinute: number,
    durationMinutes: number,
    existingOccurrences: TemporalOccurrence[],
    locationContext?: StructuredLocationContext,
    idealStartMinute?: number,
    timezone: string = "UTC"
  ): SolverSlotCandidate {
    const norm = normalizeTemporalInterval({
      dateOnly,
      startMinute,
      durationMinutes,
      timezone,
    });

    if (!norm.valid || !norm.interval) {
      return {
        dateOnly,
        startMinute,
        endMinute: startMinute + durationMinutes,
        durationMinutes,
        interval: null as any,
        suitabilityScore: 0,
        collisionDetected: true,
        collidingOccurrenceIds: [],
        transitionBufferRequiredMinutes: 0,
        transitionBufferSatisfied: false,
        explanation: `Invalid candidate interval: ${norm.error}`,
      };
    }

    const candidateInterval = norm.interval;
    const collidingIds: string[] = [];
    let transitionBufferRequired = 0;
    let transitionBufferSatisfied = true;

    // Filter to active occurrences on same date
    const dayOccurrences = existingOccurrences.filter(
      (occ) =>
        occ.dateOnly === dateOnly &&
        occ.status !== "CANCELLED" &&
        occ.status !== "SKIPPED"
    );

    // 1. Hard Collision Check
    for (const occ of dayOccurrences) {
      if (doIntervalsOverlap(candidateInterval, occ.plannedInterval)) {
        collidingIds.push(occ.occurrenceId);
      }
    }

    // 2. Transition Buffer Check with immediate chronological neighbors
    // Find occurrence immediately preceding this slot
    const preceding = dayOccurrences
      .filter((occ) => occ.plannedInterval.endMinute <= candidateInterval.startMinute)
      .sort((a, b) => b.plannedInterval.endMinute - a.plannedInterval.endMinute)[0];

    // Find occurrence immediately following this slot
    const following = dayOccurrences
      .filter((occ) => occ.plannedInterval.startMinute >= candidateInterval.endMinute)
      .sort((a, b) => a.plannedInterval.startMinute - b.plannedInterval.startMinute)[0];

    if (preceding) {
      const buffer = this.computeTransitionBufferMinutes(
        preceding.locationContext,
        locationContext
      );
      transitionBufferRequired = Math.max(transitionBufferRequired, buffer);
      const gap = candidateInterval.startMinute - preceding.plannedInterval.endMinute;
      if (gap < buffer) {
        transitionBufferSatisfied = false;
      }
    }

    if (following) {
      const buffer = this.computeTransitionBufferMinutes(
        locationContext,
        following.locationContext
      );
      transitionBufferRequired = Math.max(transitionBufferRequired, buffer);
      const gap = following.plannedInterval.startMinute - candidateInterval.endMinute;
      if (gap < buffer) {
        transitionBufferSatisfied = false;
      }
    }

    // 3. Continuous Suitability Scoring (0 - 100)
    let score = 100;
    const hasCollision = collidingIds.length > 0;

    if (hasCollision) {
      score = 0; // Hard collision eliminates viability
    } else if (!transitionBufferSatisfied) {
      score = Math.max(10, score - 50); // Severe transition deficit
    } else {
      // Proximity penalty to ideal time (deduct 1 point per 6 minutes deviation)
      if (idealStartMinute !== undefined) {
        const delta = Math.abs(startMinute - idealStartMinute);
        const penalty = Math.min(40, Math.floor(delta / 6));
        score -= penalty;
      }
    }

    const explanation = hasCollision
      ? `Collides with ${collidingIds.length} existing occurrence(s): [${collidingIds.join(", ")}]`
      : !transitionBufferSatisfied
      ? `Insufficient transition buffer (${transitionBufferRequired} min required)`
      : `Feasible slot (${score}/100 suitability)`;

    return {
      dateOnly,
      startMinute,
      endMinute: candidateInterval.endMinute,
      durationMinutes,
      interval: candidateInterval,
      suitabilityScore: score,
      collisionDetected: hasCollision,
      collidingOccurrenceIds: collidingIds,
      transitionBufferRequiredMinutes: transitionBufferRequired,
      transitionBufferSatisfied,
      explanation,
    };
  }

  /**
   * Places a scheduled block or finds the nearest feasible slot via local repair
   */
  solvePlacement(req: SolverPlacementRequest): SolverPlacementResult {
    // Enforce Active Incident & Context Constraints (Phase 4 / Exit Gate 4)
    if (req.operationalConstraints) {
      const isWorkout = req.activityType === "workout" || req.locationContext?.category === "GYM";
      if (isWorkout && req.operationalConstraints.suppressWorkouts && !req.isUserExplicitOverride) {
        return {
          feasible: false,
          repairAttempted: false,
          alternativeCandidates: [],
          reason: "[INCIDENT_CONSTRAINT_ACTIVE]: Workouts are strictly suppressed due to active incident recovery constraint.",
        };
      }

      if (
        req.operationalConstraints.activeContextMode === "sabbatical" &&
        req.activityType === "work_session" &&
        !req.isUserExplicitOverride
      ) {
        return {
          feasible: false,
          repairAttempted: false,
          alternativeCandidates: [],
          reason: "[SABBATICAL_MODE_ACTIVE]: Intensive work sessions are frozen during sabbatical mode.",
        };
      }
    }

    const tz = req.timezone || "UTC";
    const idealStart = req.idealStartMinute;


    // Evaluate ideal slot first
    const primaryCandidate = this.evaluateCandidateSlot(
      req.dateOnly,
      idealStart,
      req.durationMinutes,
      req.existingOccurrences,
      req.locationContext,
      idealStart,
      tz
    );

    if (!primaryCandidate.collisionDetected && primaryCandidate.transitionBufferSatisfied) {
      return {
        feasible: true,
        selectedSlot: primaryCandidate,
        repairAttempted: false,
        alternativeCandidates: [primaryCandidate],
      };
    }

    // If local repair is disabled, return conflict
    if (!req.allowLocalRepair) {
      return {
        feasible: false,
        selectedSlot: primaryCandidate,
        repairAttempted: false,
        alternativeCandidates: [primaryCandidate],
        reason: primaryCandidate.explanation,
      };
    }

    // Local Repair: Search step-by-step for the closest feasible slot
    // Search grid: 15-minute intervals up to 4 hours forward and backward
    const candidates: SolverSlotCandidate[] = [];
    const searchStep = 15;
    const maxOffset = 240; // 4 hours

    for (let offset = searchStep; offset <= maxOffset; offset += searchStep) {
      // Forward candidate
      const forwardStart = idealStart + offset;
      if (forwardStart + req.durationMinutes <= 1440) {
        const cFwd = this.evaluateCandidateSlot(
          req.dateOnly,
          forwardStart,
          req.durationMinutes,
          req.existingOccurrences,
          req.locationContext,
          idealStart,
          tz
        );
        if (!cFwd.collisionDetected && cFwd.transitionBufferSatisfied) {
          candidates.push(cFwd);
        }
      }

      // Backward candidate
      const backwardStart = idealStart - offset;
      if (backwardStart >= 0) {
        const cBack = this.evaluateCandidateSlot(
          req.dateOnly,
          backwardStart,
          req.durationMinutes,
          req.existingOccurrences,
          req.locationContext,
          idealStart,
          tz
        );
        if (!cBack.collisionDetected && cBack.transitionBufferSatisfied) {
          candidates.push(cBack);
        }
      }

      // If we found feasible candidates, stop widening search
      if (candidates.length >= 3) break;
    }

    if (candidates.length === 0) {
      return {
        feasible: false,
        selectedSlot: primaryCandidate,
        repairAttempted: true,
        alternativeCandidates: [primaryCandidate],
        reason: `Collision at requested time and no feasible alternative found within 4 hours`,
      };
    }

    // Sort by suitability score descending
    candidates.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
    const bestRepaired = candidates[0];

    return {
      feasible: true,
      selectedSlot: bestRepaired,
      repairAttempted: true,
      alternativeCandidates: candidates,
    };
  }
}
