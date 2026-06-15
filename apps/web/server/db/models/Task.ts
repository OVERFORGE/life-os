import mongoose from "mongoose";

const RecurringSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["daily", "weekly", "custom"],
      required: true,
    },
    interval: { type: Number, default: 1 }, // every N days (for "custom")
    daysOfWeek: [Number],                   // 0=Sun … 6=Sat (for "weekly")
  },
  { _id: false }
);

const TaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: { type: String, required: true },
    description: { type: String, default: "" },

    dueDate: { type: String, required: true }, // "YYYY-MM-DD"
    dueTime: { type: String, default: null },  // "HH:MM" 24-h, optional

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    status: {
      type: String,
      enum: ["pending", "completed", "skipped"],
      default: "pending",
    },

    completedAt: { type: Date, default: null },

    // Recurring rule — null means one-off task
    recurring: { type: RecurringSchema, default: null },

    // Optional: link to a Goal for signal contribution on completion
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Goal",
      default: null,
    },

    // Subtask support — references parent Task
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    // For recurring instances: points back to the "template" task
    recurringParentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    // ISO Date strings for when to fire push reminders
    reminders: [{ type: Date }],

    metadata: {
      energyCost: { type: Number, default: null },        // 1-10: how draining
      estimatedDuration: { type: Number, default: null }, // minutes
    },

    // Inline subtasks (lightweight checklist items, not full Task documents)
    subtasks: [
      {
        title: { type: String, required: true },
        done: { type: Boolean, default: false },
      }
    ],
  },
  { timestamps: true }
);

// Fast date-range queries
TaskSchema.index({ userId: 1, dueDate: 1 });
TaskSchema.index({ userId: 1, status: 1, dueDate: 1 });

export const Task =
  mongoose.models.Task || mongoose.model("Task", TaskSchema);
