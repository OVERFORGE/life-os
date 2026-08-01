import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConversationMessage extends Document {
  conversationId: string; // "default" for legacy records without a conversation
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenEstimate: number;
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