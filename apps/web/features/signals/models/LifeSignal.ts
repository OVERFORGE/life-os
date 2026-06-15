import { Schema, model, models } from "mongoose";

/**
 * LifeSignal = Dynamic daily field
 * Core signals are required for phase engine stability.
 */

const LifeSignalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },

    key: { type: String, required: true },
    label: { type: String, required: true },

    categoryKey: { type: String, required: true },

    inputType: {
      type: String,
      enum: ["checkbox", "number", "slider", "text", "textarea"],
      default: "number",
    },

    unit: { type: String, default: "" },

    target: { type: Number, default: null },

    min: { type: Number, default: null },
    max: { type: Number, default: null },
    step: { type: Number, default: null },

    direction: {
      type: String,
      enum: ["higher_better", "lower_better"],
      default: "higher_better",
    },

    weight: { type: Number, default: 1 },
    enabled: { type: Boolean, default: true },

    /** ✅ NEW */
    isCore: { type: Boolean, default: false },

    dependsOn: { type: String, default: null },
    showIf: { type: Number, default: null },
  },
  { timestamps: true }
);

LifeSignalSchema.index({ userId: 1, key: 1 }, { unique: true });

export const LifeSignal =
  models.LifeSignal || model("LifeSignal", LifeSignalSchema);
