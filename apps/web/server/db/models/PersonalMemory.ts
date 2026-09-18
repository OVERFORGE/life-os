import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPersonalMemoryDoc extends Document {
  userId: mongoose.Types.ObjectId;
  memoryType: string;
  domain: string;
  content: string;
  summary: string;
  source: string;
  confidence: number;
  importance: number;
  evidenceCount: number;
  firstObservedAt: Date;
  lastReinforcedAt: Date;
  validFrom?: Date;
  validTo?: Date | null;
  isArchived: boolean;
  provenance: {
    conversationId?: string;
    dailyLogDate?: string;
    observationIds?: string[];
    sourceActionId?: string;
    sourceContext?: string;
  };
  relatedEntityIds: string[];
  embedding: number[];
  embedding384?: number[];
  embeddingModel: string;
  embeddingVersion: number;
  lifecycleStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalMemorySchema = new Schema<IPersonalMemoryDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    memoryType: {
      type: String,
      required: true,
      enum: [
        "semantic_fact",
        "episodic_event",
        "behavioral_pattern",
        "goal_intelligence",
        "incident",
        "intervention",
      ],
      index: true,
    },
    domain: {
      type: String,
      required: true,
      enum: ["productivity", "health", "wellness", "identity", "general"],
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
      enum: [
        "explicit_user_statement",
        "behavioral_telemetry",
        "system_inference",
        "user_reflection",
      ],
      default: "explicit_user_statement",
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0.8,
    },
    importance: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0.5,
    },
    evidenceCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    firstObservedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastReinforcedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validTo: {
      type: Date,
      default: null,
    },
    isArchived: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    provenance: {
      conversationId: { type: String },
      dailyLogDate: { type: String },
      observationIds: [{ type: String }],
      sourceActionId: { type: String },
      sourceContext: { type: String },
    },
    relatedEntityIds: [{ type: String }],
    embedding: {
      type: [Number],
      default: [],
    },
    embedding384: {
      type: [Number],
      default: undefined,
    },
    embeddingModel: {
      type: String,
      default: "sentence-transformers/all-MiniLM-L6-v2",
    },
    embeddingVersion: {
      type: Number,
      default: 1,
    },
    lifecycleStatus: {
      type: String,
      enum: ["provisional", "verified", "reinforced", "stale", "archived"],
      default: "verified",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound filtering index for tenant-isolated vector candidates and metadata searches
PersonalMemorySchema.index({ userId: 1, isArchived: 1, domain: 1, memoryType: 1 });
PersonalMemorySchema.index({ userId: 1, confidence: -1, lastReinforcedAt: -1 });

export const PersonalMemory: Model<IPersonalMemoryDoc> =
  (mongoose.models.PersonalMemory as Model<IPersonalMemoryDoc>) ||
  mongoose.model<IPersonalMemoryDoc>("PersonalMemory", PersonalMemorySchema);
