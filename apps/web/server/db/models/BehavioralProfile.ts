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
    // FIX 15 + FIX 17: Uncertainty surface for planner consumers
    validationWarnings:        { type: [String], default: [] },
    uncertaintyLevel:          { type: String, enum: ["low", "medium", "high"], default: "high" },
    inferenceQuality:          { type: String, enum: ["weak", "moderate", "strong"], default: "weak" },
    plannerSafe:               { type: Boolean, default: false },
  },
  { _id: false }
);


const BehavioralProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

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
      
      /**
       * FUTURE ARCHITECTURE PLACEHOLDER: Data Reliability Scoring
       * Detects batch-filled logs, missing days, or fake data.
       * Default is 1 (perfect reliability). Lower score = less trust in this profile.
       */
      dataQualityScore: { type: Number, default: 1, min: 0, max: 1 },

      /**
       * FUTURE ARCHITECTURE PLACEHOLDER: Circadian Drift Detection
       * Preserves sequence metadata to track if wake/sleep is shifting 
       * (e.g. 1AM -> 2AM -> 3AM) instead of randomly jumping.
       * Will be populated in V2.
       */
      circadianDriftDirection: { type: String, enum: ["earlier", "later", "stable", "none"], default: "none" },
    },
  },
  { timestamps: true }
);

export const BehavioralProfile =
  models.BehavioralProfile || model("BehavioralProfile", BehavioralProfileSchema);
