import { Task } from "@/server/db/models/Task";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { applyTemporalDecay, clampMinutes } from "../utils/statistics";

const COMMUTE_CONFIDENCE_CAP = 0.4; // Hard architectural cap
const MIN_OBSERVATIONS_FOR_COMMUTE = 5;
const MAX_GAP_VARIANCE_FOR_SIGNAL = 900; // 30 mins² — if pre-gap variance is above this, no signal

/**
 * Infers commute patterns from recurring inactivity gaps surrounding rigid constraints.
 *
 * PHILOSOPHY:
 * - NEVER invent commute times. Prefer "unknown" over fabricated values.
 * - Only infer if consistent gaps SURROUND known recurring constraints.
 * - Confidence capped at 0.4 (no GPS data = cannot be highly certain).
 * - Remote workers / campus residents will correctly produce null outputs.
 */
export async function analyzeCommutePatterns(recurringConstraints: any[]) {
  // Require actual rigid constraints as anchors
  const rigidConstraints = recurringConstraints.filter(
    c => c.constraintStrength > 0.6 && c.stabilityScore > 0.5 && c.confidence > 0.3
  );

  if (rigidConstraints.length === 0) {
    return {
      averageLeaveMinute: null,
      averageReturnMinute: null,
      confidence: 0,
      sourceSignals: ["no_rigid_constraint_anchors"],
    };
  }

  // For each rigid constraint, gather historical task activity in the hour before/after
  // to look for consistent inactivity gaps.
  // In V1 this is done analytically: we check if tasks ONLY exist inside constraints
  // and are absent in the surrounding windows.
  //
  // Without task timestamps by hour (requires aggregation pipeline), we conservatively
  // return null because we cannot verify the gap pattern.
  //
  // This ensures we NEVER fabricate a commute from incomplete evidence.
  //
  // FUTURE ARCHITECTURE PLACEHOLDER: GPS Commute Verification
  // When location data (Google Maps Timeline / device GPS) is integrated,
  // replace this block with gap-detection against actual location events.
  // Until then, we will not infer commutes without explicit transition evidence.

  return {
    averageLeaveMinute: null,
    averageReturnMinute: null,
    confidence: 0,
    sourceSignals: [
      "commute_inference_requires_gap_evidence",
      `rigid_anchors_available:${rigidConstraints.length}`,
      "gps_or_activity_gap_data_needed",
    ],
  };
}
