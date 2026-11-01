import mongoose, { Schema, model, models } from "mongoose";

const RollingWindowSchema = new Schema(
  {
    startMinute: { type: Number, required: true },
    endMinute: { type: Number, required: true },
    score: { type: Number, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
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
    validationWarnings:        { type: [String], default: [] },
    uncertaintyLevel:          { type: String, enum: ["low", "medium", "high"], default: "high" },
    inferenceQuality:          { type: String, enum: ["weak", "moderate", "strong"], default: "weak" },
    plannerSafe:               { type: Boolean, default: false },
  },
  { _id: false }
);

const BehavioralMetricsSchema = new Schema(
  {
    taskCompletionRate: { type: Number, default: null },
    procrastinationTendency: { type: Number, default: null },
    burnoutRiskIndex: { type: Number, default: 0, min: 0, max: 1 },
    deepWorkConsistency: { type: Number, default: 0, min: 0, max: 1 },
    totalWeightedFinalizedCommitments: { type: Number, default: 0 },
    decayHalfLifeDays: { type: Number, default: 21 },
    confidenceTier: {
      type: String,
      enum: ["LOW", "MODERATE", "HIGH"],
      default: "LOW",
    },
  },
  { _id: false }
);

const BehavioralProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.Mixed, ref: "User", required: true, unique: true },

    // Cross-Aggregate Monotonic Watermark Checkpoints
    sourceCursors: {
      type: Map,
      of: Number,
      default: {},
    },

    // 50-Entry FIFO Ring Buffer of Applied Observation IDs
    recentObservationIds: {
      type: [String],
      default: [],
    },

    // Atomic CAS Rebuild Fencing Token
    projectionRevision: {
      type: Number,
      default: 0,
      required: true,
    },

    // Empirical MECE Metrics
    metrics: {
      type: BehavioralMetricsSchema,
      default: () => ({}),
    },

    lastRecalculatedAt: {
      type: Date,
      default: null,
    },

    wakeWindow: {
      averageMinutes: { type: Number, default: 480 }, // Default 8:00 AM
      variance: { type: Number, default: 0 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
    },

    sleepWindow: {
      averageMinutes: { type: Number, default: 1380 }, // Default 11:00 PM
      variance: { type: Number, default: 0 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
    },

    chronotype: {
      type: {
        type: String,
        enum: ["morning", "night", "balanced", "unknown"],
        default: "unknown"
      },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
      peakProductiveMinutes: { type: [Number], default: [] },
      sourceSignals: { type: [String], default: [] }
    },

    peakFocusWindows: {
      type: [RollingWindowSchema],
      default: [],
    },

    lowEnergyPatterns: {
      averageSleepBeforeLowEnergy: { type: Number, default: null },
      averageDeepWorkBeforeLowEnergy: { type: Number, default: null },
      averageWorkoutLoadBeforeLowEnergy: { type: Number, default: null },
      averageStressBeforeLowEnergy: { type: Number, default: null },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
    },

    workoutConsistency: {
      expectedPerWeek: { type: Number, default: null },
      actualPerWeek: { type: Number, default: 0 },
      consistencyScore: { type: Number, default: 0, min: 0, max: 1 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
    },

    behaviorStabilityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    metadata: {
      analyzedDays: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
      profileHealth: { type: ProfileHealthSchema, default: () => ({}) },
      dataQualityScore: { type: Number, default: 1, min: 0, max: 1 },
      circadianDriftDirection: { type: String, enum: ["earlier", "later", "stable", "none"], default: "none" },
    },
  },
  { timestamps: true }
);

export const BehavioralProfile =
  models.BehavioralProfile || model("BehavioralProfile", BehavioralProfileSchema);
