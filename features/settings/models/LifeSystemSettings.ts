import { Schema, model, models } from "mongoose";

const LifeSystemSettingsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    learned: {
      type: Schema.Types.Mixed,
      default: {},
    },

    overrides: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const LifeSystemSettings =
  models.LifeSystemSettings ||
  model("LifeSystemSettings", LifeSystemSettingsSchema);
