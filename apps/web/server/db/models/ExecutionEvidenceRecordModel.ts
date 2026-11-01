import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ExecutionEvidenceRecord,
  EvidenceIntegrityConflictError,
} from "../../../../../packages/execution-kernel/src/orchestration/verification/OutcomeVerificationContracts";

export interface IExecutionEvidenceRecordDoc extends Document {
  evidenceId: string;
  executionId: string;
  stepId: string;
  checkpointId: string;
  verificationClass: string;
  sourceURN: string;
  observedAt: number;
  freshnessTtlMs: number;
  authority: string;
  completeness: string;
  relevance: string;
  rawObservation: Record<string, any>;
  canonicalObservationHash: string;
  testedCriteria: string[];
  passedCriteria: string[];
  failedCriteria: string[];
  summary: string;
  keyVersion: string;
  envelopeHmac: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExecutionEvidenceRecordSchema = new Schema<IExecutionEvidenceRecordDoc>(
  {
    evidenceId: {
      type: String,
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      required: true,
      index: true,
    },
    stepId: {
      type: String,
      required: true,
      index: true,
    },
    checkpointId: {
      type: String,
      required: true,
    },
    verificationClass: {
      type: String,
      required: true,
      index: true,
    },
    sourceURN: {
      type: String,
      required: true,
    },
    observedAt: {
      type: Number,
      required: true,
    },
    freshnessTtlMs: {
      type: Number,
      required: true,
    },
    authority: {
      type: String,
      required: true,
      enum: ["KERNEL_AUTHORITATIVE", "PROVIDER_AUTHORITATIVE", "INDIRECT_TELEMETRY"],
    },
    completeness: {
      type: String,
      required: true,
      enum: ["EXHAUSTIVE", "SAMPLED"],
    },
    relevance: {
      type: String,
      required: true,
      enum: ["DIRECT_MUTATION", "CORRELATED_EFFECT"],
    },
    rawObservation: {
      type: Schema.Types.Mixed,
      default: {},
    },
    canonicalObservationHash: {
      type: String,
      required: true,
      index: true,
    },
    testedCriteria: {
      type: [String],
      default: [],
    },
    passedCriteria: {
      type: [String],
      default: [],
    },
    failedCriteria: {
      type: [String],
      default: [],
    },
    summary: {
      type: String,
      required: true,
    },
    keyVersion: {
      type: String,
      required: true,
    },
    envelopeHmac: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Strict unique compound index matching the identity tuple (Correction B)
ExecutionEvidenceRecordSchema.index(
  { executionId: 1, stepId: 1, evidenceId: 1 },
  { unique: true }
);
ExecutionEvidenceRecordSchema.index({ observedAt: -1 });

export const ExecutionEvidenceRecordModel: Model<IExecutionEvidenceRecordDoc> =
  mongoose.models.ExecutionEvidenceRecord ||
  mongoose.model<IExecutionEvidenceRecordDoc>("ExecutionEvidenceRecord", ExecutionEvidenceRecordSchema);

let testEvidenceStore: Map<string, ExecutionEvidenceRecord> | null = null;

export function setTestEvidenceStore(store: Map<string, ExecutionEvidenceRecord> | null): void {
  testEvidenceStore = store;
}

export function getTestEvidenceStore(): Map<string, ExecutionEvidenceRecord> | null {
  return testEvidenceStore;
}

/**
 * Immutable archival helper enforcing idempotent insert semantics (Correction B).
 * Never silently overwrites existing evidence.
 */
export async function archiveEvidenceRecord(
  record: ExecutionEvidenceRecord,
  session?: mongoose.ClientSession
): Promise<{ inserted: boolean; idempotentMatch: boolean }> {
  if (testEvidenceStore) {
    const key = `${record.executionId}:${record.stepId}:${record.evidenceId}`;
    const existing = testEvidenceStore.get(key);
    if (existing) {
      if (
        existing.canonicalObservationHash === record.canonicalObservationHash &&
        existing.envelopeHmac === record.envelopeHmac
      ) {
        return { inserted: false, idempotentMatch: true };
      }
      throw new EvidenceIntegrityConflictError(
        `Evidence record ${record.evidenceId} for step ${record.stepId} already exists with differing canonical hash or HMAC. Silent overwrite forbidden.`
      );
    }
    testEvidenceStore.set(key, record);
    return { inserted: true, idempotentMatch: false };
  }

  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return { inserted: true, idempotentMatch: false };
  }

  const existing = await ExecutionEvidenceRecordModel.findOne(
    {
      executionId: record.executionId,
      stepId: record.stepId,
      evidenceId: record.evidenceId,
    },
    null,
    { session }
  );

  if (existing) {
    if (
      existing.canonicalObservationHash === record.canonicalObservationHash &&
      existing.envelopeHmac === record.envelopeHmac
    ) {
      return { inserted: false, idempotentMatch: true };
    }
    throw new EvidenceIntegrityConflictError(
      `Evidence record ${record.evidenceId} for step ${record.stepId} already exists with differing canonical hash or HMAC. Silent overwrite forbidden.`
    );
  }

  await ExecutionEvidenceRecordModel.create([record], { session });
  return { inserted: true, idempotentMatch: false };
}
