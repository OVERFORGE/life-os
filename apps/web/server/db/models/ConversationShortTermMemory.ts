import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActiveEntity {
  type: string; // "goal" | "task" | "meal" | "workout" | etc.
  id: string;   // concrete DB id — written only by EntityResolver (Phase 4)
  name: string;
  lastMentionedAt: Date;
}

export interface IPendingConfirmation {
  id: string;
  type: string;
  description: string;
  payload: Record<string, any>;
  createdAt: Date;
}

export interface IToolOutput {
  type: string;
  result: Record<string, any>;
  timestamp: Date;
}

export interface IConversationShortTermMemory extends Document {
  conversationId: string;
  userId: string;
  activeEntity: IActiveEntity | null;
  pendingConfirmations: IPendingConfirmation[];
  recentToolOutputs: IToolOutput[];
  currentWorkflow: string | null;
  recentModules: string[];
  temporaryAssumptions: Record<string, any>;
  updatedAt: Date;
}

const ActiveEntitySchema = new Schema<IActiveEntity>(
  {
    type: { type: String, required: true },
    id: { type: String, required: true },
    name: { type: String, required: true },
    lastMentionedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const PendingConfirmationSchema = new Schema<IPendingConfirmation>(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    description: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ToolOutputSchema = new Schema<IToolOutput>(
  {
    type: { type: String, required: true },
    result: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConversationShortTermMemorySchema = new Schema<IConversationShortTermMemory>(
  {
    conversationId: {
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
    activeEntity: {
      type: ActiveEntitySchema,
      default: null,
    },
    pendingConfirmations: {
      type: [PendingConfirmationSchema],
      default: [],
    },
    recentToolOutputs: {
      type: [ToolOutputSchema],
      default: [],
    },
    currentWorkflow: {
      type: String,
      default: null,
    },
    recentModules: {
      type: [String],
      default: [],
    },
    temporaryAssumptions: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const ConversationShortTermMemory: Model<IConversationShortTermMemory> =
  (mongoose.models.ConversationShortTermMemory as Model<IConversationShortTermMemory>) ||
  mongoose.model<IConversationShortTermMemory>(
    "ConversationShortTermMemory",
    ConversationShortTermMemorySchema
  );
