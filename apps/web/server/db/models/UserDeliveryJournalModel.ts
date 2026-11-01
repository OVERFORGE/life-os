/**
 * UserDeliveryJournalModel.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Durable per-user delivery journal storing allocated sequence positions,
 * pre-publication status, and exact replay records.
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export type DeliveryJournalStatus = "COMMITTED" | "PUBLISHED" | "ACKNOWLEDGED";

export interface IUserDeliveryJournalDoc extends Document {
  userId: string;
  deliverySeq: number;
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  occurredAt: Date;
  invalidationTags: string[];
  status: DeliveryJournalStatus;
  leaseGeneration: number;
  publishedAt?: Date | null;
  acknowledgedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserDeliveryJournalSchema = new Schema<IUserDeliveryJournalDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    deliverySeq: {
      type: Number,
      required: true,
      index: true,
      min: 1,
    },
    eventId: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    invalidationTags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: ["COMMITTED", "PUBLISHED", "ACKNOWLEDGED"],
      default: "COMMITTED",
      index: true,
    },
    leaseGeneration: {
      type: Number,
      required: true,
      default: 0,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "user_delivery_journals",
  }
);

// Compound Unique Indexes:
// 1. Exactly one record per (userId, deliverySeq) position
UserDeliveryJournalSchema.index({ userId: 1, deliverySeq: 1 }, { unique: true });

// 2. Exactly one journal record per (userId, eventId) preventing duplicate publication
UserDeliveryJournalSchema.index({ userId: 1, eventId: 1 }, { unique: true });

// Query index for replay range and status
UserDeliveryJournalSchema.index({ userId: 1, status: 1, deliverySeq: 1 });

export const UserDeliveryJournalModel: Model<IUserDeliveryJournalDoc> =
  (mongoose.models.UserDeliveryJournal as Model<IUserDeliveryJournalDoc>) ||
  mongoose.model<IUserDeliveryJournalDoc>(
    "UserDeliveryJournal",
    UserDeliveryJournalSchema
  );

