import mongoose from "mongoose";

const GoalProposalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
    proposal: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const GoalProposal =
  mongoose.models.GoalProposal ||
  mongoose.model("GoalProposal", GoalProposalSchema);
