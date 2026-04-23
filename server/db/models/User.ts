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
    settings: {
      timezone: String,
      weekStartsOn: Number,
      units: {
        weight: String,
        calories: String,
      },
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
