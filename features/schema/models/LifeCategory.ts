import { Schema, model, models } from "mongoose";

const LifeCategorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    key: {
      type: String,
      required: true,
    },

    label: {
      type: String,
      required: true,
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

LifeCategorySchema.index({ userId: 1, key: 1 }, { unique: true });

export const LifeCategory =
  models.LifeCategory || model("LifeCategory", LifeCategorySchema);
