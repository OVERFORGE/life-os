import mongoose from "mongoose";

const LoggedSetSchema = new mongoose.Schema({
  repsDone: { type: Number, required: true },
  weightUsed: { type: Number, required: false }, // lbs or kg
  restSecondsTaken: { type: Number, required: false }, // actually this should probably be string or number based on UI, we use number
  assisted: { type: Boolean, default: false },
  assistedAtRep: { type: Number, required: false },
});

const LoggedExerciseSchema = new mongoose.Schema({
  equipmentName: { type: String, required: true },
  sets: [LoggedSetSchema],
});

const WorkoutSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    routineId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutRoutine", required: false }, // optional if freestyle
    splitDayName: { type: String, required: false },
    date: { type: Date, default: Date.now },
    durationSeconds: { type: Number, required: true }, // Total time spent in the gym
    exercises: [LoggedExerciseSchema],
  },
  { timestamps: true }
);

export const WorkoutSession = mongoose.models.WorkoutSession || mongoose.model("WorkoutSession", WorkoutSessionSchema);
