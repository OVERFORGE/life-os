import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: String,
    email: { type: String, unique: true },
    avatar: String,
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

export const User = models.User || model("User", UserSchema);
