import mongoose from "mongoose";

const LoggedSetSchema = new mongoose.Schema({
  repsDone: { type: Number, required: true },
  weightUsed: { type: Number, required: false }, // lbs or kg
  restSecondsTaken: { type: Number, required: false },
  assisted: { type: Boolean, default: false },
  assistedAtRep: { type: Number, required: false },
  note: { type: String, required: false },
  imageUrl: { type: String, required: false },
});

const LoggedExerciseSchema = new mongoose.Schema({
  equipmentName: { type: String, required: true },
  sets: [LoggedSetSchema],
});

const WorkoutSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.Mixed, ref: "User", required: true, index: true },
    routineId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutRoutine", required: false },
    splitDayName: { type: String, required: false },
    workoutType: { type: String, default: "workout" },
    date: { type: Date, default: Date.now },
    dateOnly: { type: String, required: true, index: true }, // "YYYY-MM-DD" in user's active timezone
    durationSeconds: { type: Number, required: true }, // Total time spent in the gym
    calories: { type: Number, default: 0 },
    strainScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
    archivedAt: { type: Date },
    exercises: [LoggedExerciseSchema],

    // Optimistic Concurrency & Outbox Fencing
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [Object], default: [] },
  },
  { timestamps: true }
);

// Compound index for authoritative daily projection resolution
WorkoutSessionSchema.index({ userId: 1, dateOnly: 1, status: 1 });

export const WorkoutSession = mongoose.models.WorkoutSession || mongoose.model("WorkoutSession", WorkoutSessionSchema);
