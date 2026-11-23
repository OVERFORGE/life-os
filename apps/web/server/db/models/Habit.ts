import mongoose, { Document, Schema } from "mongoose";

export interface IHabitDay {
  date: string; // YYYY-MM-DD
  completed: boolean;
}

export interface IHabit extends Document {
  userId: string | mongoose.Types.ObjectId;
  title: string;
  frequency: string; // e.g. "Mon–Fri", "Daily", "Every Friday", "Weekly"
  supportingGoalId?: string | mongoose.Types.ObjectId;
  supportingGoalTitle?: string;
  category: "work" | "health" | "learning" | "mindfulness" | "routine";
  status: "active" | "archived";
  targetDaysPerWeek: number;
  streak: number;
  recentDays: IHabitDay[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const HabitDaySchema = new Schema<IHabitDay>(
  {
    date: { type: String, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const HabitSchema = new Schema<IHabit>(
  {
    userId: { type: Schema.Types.Mixed, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    frequency: { type: String, default: "Daily" },
    supportingGoalId: { type: Schema.Types.Mixed, ref: "Goal" },
    supportingGoalTitle: { type: String, default: "" },
    category: {
      type: String,
      enum: ["work", "health", "learning", "mindfulness", "routine"],
      default: "routine",
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
    targetDaysPerWeek: { type: Number, default: 5 },
    streak: { type: Number, default: 0 },
    recentDays: { type: [HabitDaySchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

HabitSchema.pre("save", function () {
  if (this.userId) {
    this.userId = this.userId.toString();
  }
});

export const Habit = mongoose.models.Habit || mongoose.model<IHabit>("Habit", HabitSchema);
