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

export interface IContextEntityRef {
  entityType: "task" | "goal" | "meal" | "workout" | "activity" | "incident" | "context_mode" | "weight";
  entityId: string;
  displayName: string;
  domain: "productivity" | "health" | "wellness" | "context";
  status?: string;
  temporalAnchor?: string;
  metadata?: Record<string, any>;
  lastReferencedTurnId?: string;
  updatedAt?: Date;
}

export interface IPendingOperationContext {
  operationId: string;
  turnId: string;
  actionType: string;
  domain: "productivity" | "health" | "wellness" | "context";
  partialPayload: Record<string, any>;
  missingRequirement: {
    kind: "TARGET_ENTITY_RESOLUTION" | "TEMPORAL_SPECIFICATION" | "PARAMETER_VALUE" | "DUPLICATE_CONFIRMATION";
    targetEntityType?: "task" | "goal" | "meal" | "workout" | "activity" | "weight" | "context_mode";
    parameterName?: string;
  };
  clarificationQuestion: string;
  candidateEntities?: Array<{
    entityId: string;
    displayName: string;
    temporalAnchor?: string;
    metadata?: Record<string, any>;
  }>;
  state: "CREATED" | "AWAITING_CLARIFICATION" | "CONTINUED" | "CANCELLED" | "EXPIRED" | "COMPLETED";
  createdAt: Date;
  expiresAt: Date;
}

export interface IExecutedOperationSnapshot {
  operationId: string;
  turnId: string;
  actionType: string;
  domain: "productivity" | "health" | "wellness" | "context";
  targetEntity?: {
    entityType: string;
    entityId: string;
    displayName: string;
  };
  payloadSnapshot: Record<string, any>;
  success: boolean;
  executedAt: Date;
  reversibility: "atomic_single_doc" | "reversible_with_compensation" | "irreversible_external";
}

export interface IConversationShortTermMemory extends Document {
  conversationId: string;
  userId: string;
  activeEntity: IActiveEntity | null;
  activeFocus: IContextEntityRef | null;
  recentEntities: IContextEntityRef[];
  pendingOperation: IPendingOperationContext | null;
  recentlyExecutedOperations: IExecutedOperationSnapshot[];
  activeContextMode: string;
  activeIncidents: string[];
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

const ContextEntityRefSchema = new Schema<IContextEntityRef>(
  {
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    displayName: { type: String, required: true },
    domain: { type: String, required: true },
    status: { type: String },
    temporalAnchor: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    lastReferencedTurnId: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PendingOperationSchema = new Schema<IPendingOperationContext>(
  {
    operationId: { type: String, required: true },
    turnId: { type: String, required: true },
    actionType: { type: String, required: true },
    domain: { type: String, required: true },
    partialPayload: { type: Schema.Types.Mixed, default: {} },
    missingRequirement: {
      kind: { type: String, required: true },
      targetEntityType: { type: String },
      parameterName: { type: String },
    },
    clarificationQuestion: { type: String, required: true },
    candidateEntities: { type: [Schema.Types.Mixed], default: [] },
    state: { type: String, required: true, default: "AWAITING_CLARIFICATION" },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const ExecutedOperationSnapshotSchema = new Schema<IExecutedOperationSnapshot>(
  {
    operationId: { type: String, required: true },
    turnId: { type: String, required: true },
    actionType: { type: String, required: true },
    domain: { type: String, required: true },
    targetEntity: {
      entityType: { type: String },
      entityId: { type: String },
      displayName: { type: String },
    },
    payloadSnapshot: { type: Schema.Types.Mixed, default: {} },
    success: { type: Boolean, required: true },
    executedAt: { type: Date, default: Date.now },
    reversibility: { type: String, required: true },
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
    activeFocus: {
      type: ContextEntityRefSchema,
      default: null,
    },
    recentEntities: {
      type: [ContextEntityRefSchema],
      default: [],
    },
    pendingOperation: {
      type: PendingOperationSchema,
      default: null,
    },
    recentlyExecutedOperations: {
      type: [ExecutedOperationSnapshotSchema],
      default: [],
    },
    activeContextMode: {
      type: String,
      default: "standard",
    },
    activeIncidents: {
      type: [String],
      default: [],
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
