/**
 * UserDeliverySequenceModel.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Monotonic per-user delivery sequence allocation model.
 * Partitioned strictly by userId to guarantee zero global serialization bottlenecks.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserDeliverySequenceDoc extends Document {
  userId: string;
  currentSequence: number;
  lastAllocatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserDeliverySequenceSchema = new Schema<IUserDeliverySequenceDoc>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    currentSequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastAllocatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "user_delivery_sequences",
  }
);

export const UserDeliverySequenceModel: Model<IUserDeliverySequenceDoc> =
  (mongoose.models.UserDeliverySequence as Model<IUserDeliverySequenceDoc>) ||
  mongoose.model<IUserDeliverySequenceDoc>(
    "UserDeliverySequence",
    UserDeliverySequenceSchema
  );

