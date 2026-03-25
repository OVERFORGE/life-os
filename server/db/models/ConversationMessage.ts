import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    userId: String,
    role: String,
    content: String,
  },
  { timestamps: true }
);

export const ConversationMessage =
  mongoose.models.ConversationMessage ||
  mongoose.model("ConversationMessage", ConversationSchema);