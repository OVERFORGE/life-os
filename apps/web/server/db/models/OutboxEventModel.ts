import mongoose, { Schema, Document, Model } from "mongoose";

export type OutboxDeliveryStatus =
  | "PENDING_COMMIT"
  | "PENDING"
  | "PROCESSING"
  | "DELIVERED"
  | "FAILED"
  | "DEAD_LETTER"
  | "ABORTED";

export type EventCategoryType =
  | "DOMAIN_EVENT"
  | "TELEMETRY_EVENT"
  | "ANALYTICAL_EVENT"
  | "SYSTEM_EVENT"
  | "OBSERVATION_EVENT"
  | "DOMAIN"
  | "TELEMETRY"
  | "SYSTEM"
  | "INTEGRATION"
  | "PROJECTION";

export interface IMutationIntentSubdoc {
  clientMutationId?: string;
  expectedVersion?: number;
  fencingEpoch?: number;
  diffHash?: string;
}

export interface IOutboxEventDoc extends Document {
  eventId: string;
  userId: string;
  category: EventCategoryType;
  type: string;
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  eventOrdinal: number;
  causalSequence: number;
  occurredAt: Date;
  recordedAt: Date;
  correlationId: string;
  causalityRef?: string;
  source: string;
  payload: any;
  metadata: Record<string, any>;
  deliveryStatus: OutboxDeliveryStatus;
  leasedByWorkerId?: string | null;
  leaseExpiresAt?: Date | null;
  leaseGeneration: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  deliveredAt?: Date | null;
  failureReason?: string | null;
  mutationIntent?: IMutationIntentSubdoc;
  createdAt: Date;
  updatedAt: Date;
}

const MutationIntentSchema = new Schema<IMutationIntentSubdoc>(
  {
    clientMutationId: { type: String },
    expectedVersion: { type: Number },
    fencingEpoch: { type: Number },
    diffHash: { type: String },
  },
  { _id: false }
);

const OutboxEventSchema = new Schema<IOutboxEventDoc>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "DOMAIN_EVENT",
        "TELEMETRY_EVENT",
        "ANALYTICAL_EVENT",
        "SYSTEM_EVENT",
        "OBSERVATION_EVENT",
        "DOMAIN",
        "TELEMETRY",
        "SYSTEM",
        "INTEGRATION",
        "PROJECTION",
      ],
    },
    type: {
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
    aggregateVersion: {
      type: Number,
      required: true,
    },
    eventOrdinal: {
      type: Number,
      required: true,
      default: 1,
    },
    causalSequence: {
      type: Number,
      required: true,
      index: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    correlationId: {
      type: String,
      required: true,
    },
    causalityRef: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    deliveryStatus: {
      type: String,
      required: true,
      enum: [
        "PENDING_COMMIT",
        "PENDING",
        "PROCESSING",
        "DELIVERED",
        "FAILED",
        "DEAD_LETTER",
        "ABORTED",
      ],
      default: "PENDING",
      index: true,
    },
    leasedByWorkerId: {
      type: String,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    leaseGeneration: {
      type: Number,
      required: true,
      default: 0,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
      default: 5,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    mutationIntent: {
      type: MutationIntentSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal dispatcher queries & monotonic ordering
OutboxEventSchema.index({ deliveryStatus: 1, nextAttemptAt: 1 });
OutboxEventSchema.index({ deliveryStatus: 1, leaseExpiresAt: 1 });
OutboxEventSchema.index({ userId: 1, deliveryStatus: 1 });
OutboxEventSchema.index({ aggregateId: 1, causalSequence: 1 });

export const OutboxEventModel: Model<IOutboxEventDoc> =
  mongoose.models.OutboxEvent ||
  mongoose.model<IOutboxEventDoc>("OutboxEvent", OutboxEventSchema);
