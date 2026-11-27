import mongoose from "mongoose";

const GoalProposalSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
    proposal: { type: mongoose.Schema.Types.Mixed },
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const GoalProposal =
  mongoose.models.GoalProposal ||
  mongoose.model("GoalProposal", GoalProposalSchema);
