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
    userId: { type: mongoose.Schema.Types.Mixed, ref: "User", index: true },

    title: String,
    description: String,

    status: {
      type: String,
      enum: ["active", "proposed", "archived", "completed"],
      default: "active",
      index: true,
    },
    confirmedAt: Date,
    archivedAt: Date,
    remediationReason: String,
    canonicalGoalId: String,

    nature: {
      type: String,
      enum: ["finite_deliverable", "habitual_cadence"],
      default: "habitual_cadence",
      index: true,
    },

    definitionOfDone: { type: String },
    targetCompletionDate: { type: Date },

    milestones: [
      {
        milestoneId: { type: String, required: true },
        title: { type: String, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        linkedTaskId: { type: String },
        order: { type: Number, default: 0 },
      },
    ],

    deliverableProgressPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

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


// Pre-save normalization: guarantee string userId and trimmed title
GoalSchema.pre("save", function () {
  if (this.userId) {
    this.userId = this.userId.toString();
  }
  if (this.title) {
    this.title = this.title.trim();
  }
});

// Partial unique index: prevent duplicate active or proposed goals per user
GoalSchema.index(
  { userId: 1, title: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["active", "proposed"] } },
  }
);

export const Goal =
  mongoose.models.Goal || mongoose.model("Goal", GoalSchema);
