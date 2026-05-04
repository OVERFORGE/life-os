import mongoose from "mongoose";

const SetDetailSchema = new mongoose.Schema({
  note: { type: String, required: false },
  imageUrl: { type: String, required: false },
});

const ExerciseSchema = new mongoose.Schema({
  equipmentName: { type: String, required: true },
  targetSets: { type: Number, required: true },
  targetReps: { type: Number, required: true },
  restSeconds: { type: Number, default: 90 },
  setDetails: [SetDetailSchema],
});

const SplitDaySchema = new mongoose.Schema({
  dayName: { type: String, required: true }, // e.g. "Push Day", "Back/Biceps"
  exercises: [ExerciseSchema],
});

const WorkoutRoutineSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    gymId: { type: mongoose.Schema.Types.ObjectId, ref: "Gym", required: true },
    routineName: { type: String, required: true }, // e.g. "Push Pull Legs"
    splitDays: [SplitDaySchema],
  },
  { timestamps: true }
);

export const WorkoutRoutine = mongoose.models.WorkoutRoutine || mongoose.model("WorkoutRoutine", WorkoutRoutineSchema);
