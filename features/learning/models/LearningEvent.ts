import mongoose, { Schema, model, models } from "mongoose";

const LearningEventSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ["phase_sensitivity_update", "goal_load_weight_update"],
    },

    before: {
      type: Schema.Types.Mixed,
      required: true,
    },

    after: {
      type: Schema.Types.Mixed,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    confidence: {
      type: Number,
      default: 0.5,
    },

    driverSignal: {
      type: String,
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

export const LearningEvent =
  models.LearningEvent ||
  model("LearningEvent", LearningEventSchema);