import mongoose, { Schema, Document, Model } from "mongoose";

/** Generate a short unique conversation ID */
function generateConversationId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export interface IConversationMetadata {
  topics: string[];
  pendingItems: string[];
  createdEntities: string[];
}

export interface IConversation extends Document {
  conversationId: string;
  userId: string;
  title: string;
  summary: string;
  archived: boolean;
  pinned: boolean;
  messageCount: number;
  tokenEstimate: number;
  lastMessageAt: Date | null;
  // Summary freshness tracking
  lastSummarizedAt: Date | null;
  lastSummarizedMessageId: string | null;
  metadata: IConversationMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => generateConversationId(),
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Conversation",
    },
    summary: {
      type: String,
      default: "",
    },
    archived: {
      type: Boolean,
      default: false,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    tokenEstimate: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastSummarizedAt: {
      type: Date,
      default: null,
    },
    lastSummarizedMessageId: {
      type: String,
      default: null,
    },
    metadata: {
      topics: { type: [String], default: [] },
      pendingItems: { type: [String], default: [] },
      createdEntities: { type: [String], default: [] },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: fast per-user conversation listing sorted by last activity
ConversationSchema.index({ userId: 1, lastMessageAt: -1 });
// Compound index: archived filtering
ConversationSchema.index({ userId: 1, archived: 1, lastMessageAt: -1 });

export const Conversation: Model<IConversation> =
  (mongoose.models.Conversation as Model<IConversation>) ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);
