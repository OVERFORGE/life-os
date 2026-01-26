import mongoose from "mongoose";

const SignalSchema = new mongoose.Schema({
  key: { type: String, required: true }, 
  weight: { type: Number, default: 1 },
  direction: {
    type: String,
    enum: ["higher_better", "lower_better"],
    default: "higher_better",
  },
});

const GoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    title: String,
    description: String,

    type: {
      type: String,
      enum: ["identity", "performance", "maintenance"],
      default: "performance",
    },

    cadence: {
      type: String,
      enum: ["daily", "weekly", "flexible"],
      default: "daily",
    },

    signals: [SignalSchema],

    rules: {
      minActiveDaysPerWeek: { type: Number, default: 3 },
      graceDaysPerWeek: { type: Number, default: 2 },
    },
  },
  { timestamps: true }
);

export const Goal =
  mongoose.models.Goal || mongoose.model("Goal", GoalSchema);
