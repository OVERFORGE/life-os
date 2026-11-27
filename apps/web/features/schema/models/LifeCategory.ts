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
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

LifeCategorySchema.index({ userId: 1, key: 1 }, { unique: true });

export const LifeCategory =
  models.LifeCategory || model("LifeCategory", LifeCategorySchema);
