import { Schema, model, models } from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: { type: String, select: false }, // Don't return by default
    avatar: String,
    gender: String,
    age: Number,
    weight: Number, // Stored in unified KGs
    height: Number,
    heightUnit: { type: String, default: 'cm', enum: ['cm', 'ft'] },
    targetCalories: { type: Number, default: 2000 },
    maintenanceCalories: { type: Number, default: 2200 },
    dietMode: { 
      type: String, 
      enum: ['bulk', 'slight_bulk', 'recomp', 'slight_cut', 'cut'], 
      default: 'recomp' 
    },
    dietModeCalorieOffset: { type: Number, default: 0 }, // kcal above/below maintenance
    settings: {
      timezone: String,
      weekStartsOn: Number,
      units: {
        weight: String,
        calories: String,
      },
    },
    preferences: {
      weightReminderEnabled: { type: Boolean, default: true },
      weightReminderDay:     { type: Number, default: 0 },   // 0=Sun, 1=Mon...6=Sat
      weightReminderHour:    { type: Number, default: 9 },   // 9 = 9:00 AM local time
      dayRolloverHour:       { type: Number, default: 4 },   // 4 = 4:00 AM (hours before count as prev day)
    },
  },
  { timestamps: true }
);

// Pre-save hook to hash passwords automatically when they're modified
UserSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export const User = models.User || model("User", UserSchema);
