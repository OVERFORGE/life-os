import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRelationshipCommitmentDoc {
  commitmentId: string;
  title: string;
  dueTimestamp: number;
  status: "pending" | "completed" | "breached";
}

export interface IRelationshipDoc extends Document {
  userId: string;
  entityId: string;
  name: string;
  aliases: string[];
  role: string;
  importanceScore: number;
  interactionCadenceDays: number;
  lastInteractedAt: number;
  activeCommitments: IRelationshipCommitmentDoc[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RelationshipCommitmentSchema = new Schema(
  {
    commitmentId: { type: String, required: true },
    title: { type: String, required: true },
    dueTimestamp: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "breached"],
      default: "pending",
    },
  },
  { _id: false }
);

const RelationshipSchema = new Schema<IRelationshipDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    role: {
      type: String,
      default: "Collaborator",
    },
    importanceScore: {
      type: Number,
      default: 0.5,
      min: 0.0,
      max: 1.0,
    },
    interactionCadenceDays: {
      type: Number,
      default: 7,
    },
    lastInteractedAt: {
      type: Number,
      default: Date.now,
    },
    activeCommitments: {
      type: [RelationshipCommitmentSchema],
      default: [],
    },
    notes: {
      type: String,
    },
  },
  {
    collection: "relationships",
    timestamps: true,
  }
);

// Compound index for user queries sorted by last interaction
RelationshipSchema.index({ userId: 1, lastInteractedAt: -1 });

export const RelationshipModel: Model<IRelationshipDoc> =
  mongoose.models.RelationshipRecord ||
  mongoose.model<IRelationshipDoc>("RelationshipRecord", RelationshipSchema);
