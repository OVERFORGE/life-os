import mongoose, { Schema, model, models } from "mongoose";

const RecurringConstraintSchema = new Schema(
  {
    // Generic types only — never invent semantic labels
    // Allowed: "inferred_recurring", "scheduled_recurring", "explicit_calendar_constraint"
    type: { type: String, required: true },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 0, max: 1439 },
    daysOfWeek: { type: [Number], required: true }, // 0=Sun … 6=Sat
    confidence: { type: Number, required: true, min: 0, max: 1 },

    // Temporal rigidity
    variance: { type: Number, default: 0 },
    stabilityScore: { type: Number, default: 0, min: 0, max: 1 },
    constraintStrength: { type: Number, default: 0, min: 0, max: 1 },

    // Reliability: multiplied by confidence to prevent fake precision
    completionTimeReliability: { type: Number, default: 1, min: 0, max: 1 },
    temporalSpreadDays: { type: Number, default: 0 },

    // Explainability
    sourceSignals: { type: [String], default: [] },
  },
  { _id: false }
);

const AvailabilityWindowSchema = new Schema(
  {
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 0, max: 1439 },
    daysOfWeek: { type: [Number], default: [] }, // empty = applies to all days
    score: { type: Number, required: true, min: 0, max: 1 },
    confidence: { type: Number, required: true, min: 0, max: 1 },

    // Full explainability for future planner debugging
    sourceSignals: { type: [String], default: [] },
    penaltiesApplied: { type: [String], default: [] },
    boostsApplied: { type: [String], default: [] },
    blockingReasons: { type: [String], default: [] },
  },
  { _id: false }
);

const RecoveryWindowSchema = new Schema(
  {
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 0, max: 1439 },
    trigger: { type: String, default: "unknown" }, // e.g. "deep_work_overload", "post_gym"
    lagMinutes: { type: Number, default: 0 }, // How long after the triggering event
    recoveryPenalty: { type: Number, default: 0, min: 0, max: 0.5 }, // Capped at 0.5
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    sourceSignals: { type: [String], default: [] },
  },
  { _id: false }
);

const ProfileHealthSchema = new Schema(
  {
    dataCoverageScore:         { type: Number, default: 0, min: 0, max: 1 },
    temporalCoverageDays:      { type: Number, default: 0 },
    sparsityScore:             { type: Number, default: 0, min: 0, max: 1 },
    confidenceIntegrityScore:  { type: Number, default: 0, min: 0, max: 1 },
    temporalDistributionScore: { type: Number, default: 0, min: 0, max: 1 },
    // FIX 15 + FIX 17
    validationWarnings:        { type: [String], default: [] },
    uncertaintyLevel:          { type: String, enum: ["low", "medium", "high"], default: "high" },
    inferenceQuality:          { type: String, enum: ["weak", "moderate", "strong"], default: "weak" },
    plannerSafe:               { type: Boolean, default: false },
  },
  { _id: false }
);


const ConstraintProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    recurringConstraints: {
      type: [RecurringConstraintSchema],
      default: [],
    },

    commutePatterns: {
      averageLeaveMinute: { type: Number, default: null },
      averageReturnMinute: { type: Number, default: null },
      confidence: { type: Number, default: 0, min: 0, max: 0.4 }, // Hard cap: 0.4
      sourceSignals: { type: [String], default: [] },
    },

    availabilityWindows: {
      type: [AvailabilityWindowSchema],
      default: [],
    },

    recoveryWindows: {
      type: [RecoveryWindowSchema],
      default: [],
    },

    taskDensityPatterns: {
      // Volume = raw task count; Strain = cognitive cost weighted
      averageTaskVolume: { type: Number, default: 0 },
      averageCognitiveLoad: { type: Number, default: 0 },
      averageExecutionStrain: { type: Number, default: 0 }, // Deep work / architecture weighted
      overloadThreshold: { type: Number, default: 0 },
      underloadThreshold: { type: Number, default: 0 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
      sourceSignals: { type: [String], default: [] },
    },

    contextSwitchingProfile: {
      fragmentationScore: { type: Number, default: 0, min: 0, max: 1 },
      switchEntropyScore: { type: Number, default: 0, min: 0, max: 1 }, // Category diversity
      averageSwitchesPerDay: { type: Number, default: 0 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
      sourceSignals: { type: [String], default: [] },
    },

    metadata: {
      analyzedDays: { type: Number, default: 0 }, // True distinct days, NOT increment
      profileHealth: { type: ProfileHealthSchema, default: () => ({}) },

      /**
       * FUTURE ARCHITECTURE PLACEHOLDER: Seasonal/Weekly Segmentation
       * Preserves metadata to eventually split analysis by:
       * - weekday vs weekend; semester shifts; life phase transitions
       */
      seasonalSegmentationPrepared: { type: Boolean, default: true },

      /**
       * FUTURE ARCHITECTURE PLACEHOLDERS:
       * - calendarIntegrationReady: Boolean   (Google Calendar / iCal)
       * - gpsCommuteVerificationReady: Boolean (Live location anchoring)
       * - realtimeEnergyPredictionReady: Boolean
       * - dynamicReplanningReady: Boolean
       * - phaseAwareSchedulingReady: Boolean
       * - socialEnergyModelingReady: Boolean
       * - biologicalRecoveryScoringReady: Boolean
       */

      lastUpdated: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

export const ConstraintProfile =
  models.ConstraintProfile || model("ConstraintProfile", ConstraintProfileSchema);
