import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConversationMessage extends Document {
  conversationId: string; // "default" for legacy records without a conversation
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenEstimate: number;
  toolActivities?: Array<{
    id: string;
    providerId: string;
    providerDisplayName: string;
    capabilityURN: string;
    iconName: string;
    humanMessage: string;
    state: "started" | "completed" | "failed";
    error?: string;
    details?: any;
  }>;
  missingConnection?: {
    providerId: string;
    providerDisplayName: string;
    capabilityURN?: string;
    message: string;
    connectUrl?: string;
    iconName?: string;
  };
  confirmation?: {
    actionId: string;
    title: string;
    description: string;
    impactSummary?: string;
    riskClass?: string;
    previewData?: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ConversationMessageSchema = new Schema<IConversationMessage>(
  {
    conversationId: {
      type: String,
      required: true,
      default: "default",
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokenEstimate: {
      type: Number,
      default: 0,
    },
    toolActivities: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },
    missingConnection: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    confirmation: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: fetch all messages for a conversation in order
ConversationMessageSchema.index({ conversationId: 1, createdAt: 1 });
// Legacy support: userId-only query still works for backward compat
ConversationMessageSchema.index({ userId: 1, createdAt: 1 });

export const ConversationMessage: Model<IConversationMessage> =
  (mongoose.models.ConversationMessage as Model<IConversationMessage>) ||
  mongoose.model<IConversationMessage>("ConversationMessage", ConversationMessageSchema);