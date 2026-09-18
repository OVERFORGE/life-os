import mongoose, { Schema, Document, Model } from "mongoose";

export interface IExecutionWorkspaceDoc extends Document {
  executionId: string;
  userId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  status: string;
  iteration: number;
  stateVersion: number;
  terminationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionWorkspaceSchema = new Schema<IExecutionWorkspaceDoc>(
  {
    executionId: {
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
    conversationId: {
      type: String,
      index: true,
    },
    userRequest: {
      type: String,
      required: true,
    },
    goal: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: "INITIALIZED",
      index: true,
    },
    iteration: {
      type: Number,
      required: true,
      default: 1,
    },
    stateVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    terminationReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const ExecutionWorkspaceModel: Model<IExecutionWorkspaceDoc> =
  mongoose.models.ExecutionWorkspace ||
  mongoose.model<IExecutionWorkspaceDoc>("ExecutionWorkspace", ExecutionWorkspaceSchema);
