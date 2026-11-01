import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAutonomousExecutionLeaseDoc extends Document {
  userId: string;
  leaseHolder: string;
  epoch: number;
  acquiredAt: Date;
  expiresAt: Date;
  heartbeatAt: Date;
  status: "ACTIVE" | "EXPIRED" | "RELEASED";
  fencingToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const AutonomousExecutionLeaseSchema = new Schema<IAutonomousExecutionLeaseDoc>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    leaseHolder: {
      type: String,
      default: "",
    },
    epoch: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: Date.now,
      index: true, // Standard non-TTL index for fast lease expiration scanning
    },
    heartbeatAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "RELEASED"],
      default: "EXPIRED",
      index: true,
    },
    fencingToken: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "autonomous_execution_leases",
  }
);

// CRITICAL SAFETY INVARIANT: Absolutely NO MongoDB TTL index on this collection.
// Lease expiration is evaluated explicitly via atomic CAS comparisons.

export const AutonomousExecutionLeaseModel: Model<IAutonomousExecutionLeaseDoc> =
  (mongoose.models.AutonomousExecutionLease as Model<IAutonomousExecutionLeaseDoc>) ||
  mongoose.model<IAutonomousExecutionLeaseDoc>("AutonomousExecutionLease", AutonomousExecutionLeaseSchema);

