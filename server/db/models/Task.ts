import { Schema, model, models } from "mongoose";

const TaskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true },
    description: String,

    status: {
      type: String,
      enum: ["pending", "completed", "skipped"],
      default: "pending",
    },

    dueDate: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

export const Task = models.Task || model("Task", TaskSchema);
