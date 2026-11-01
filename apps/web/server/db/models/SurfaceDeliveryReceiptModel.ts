/**
 * SurfaceDeliveryReceiptModel.ts
 * 
 * Milestone B — Phase B4: Work Package 4 / Loop 7
 * Tracks multi-surface delivery cursors, unacknowledged events, and monotonic sequence replay.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUnacknowledgedStreamEvent {
  eventId: string;
  causalSequence: number;
  type: string;
  dispatchedAt: Date;
}

export interface ISurfaceDeliveryReceiptDoc extends Document {
  userId: string;
  surfaceId: string;
  lastAcknowledgedSeq: number;
  acknowledgedAt: Date;
  activeChannel: "SSE" | "WS" | "PUSH";
  unacknowledgedEvents: IUnacknowledgedStreamEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const UnacknowledgedStreamEventSchema = new Schema<IUnacknowledgedStreamEvent>(
  {
    eventId: { type: String, required: true },
    causalSequence: { type: Number, required: true },
    type: { type: String, required: true },
    dispatchedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SurfaceDeliveryReceiptSchema = new Schema<ISurfaceDeliveryReceiptDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    surfaceId: {
      type: String,
      required: true,
      index: true,
    },
    lastAcknowledgedSeq: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now,
    },
    activeChannel: {
      type: String,
      enum: ["SSE", "WS", "PUSH"],
      default: "SSE",
    },
    unacknowledgedEvents: {
      type: [UnacknowledgedStreamEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "surface_delivery_receipts",
  }
);

SurfaceDeliveryReceiptSchema.index({ userId: 1, surfaceId: 1 }, { unique: true });

export const SurfaceDeliveryReceiptModel: Model<ISurfaceDeliveryReceiptDoc> =
  (mongoose.models.SurfaceDeliveryReceipt as Model<ISurfaceDeliveryReceiptDoc>) ||
  mongoose.model<ISurfaceDeliveryReceiptDoc>("SurfaceDeliveryReceipt", SurfaceDeliveryReceiptSchema);

