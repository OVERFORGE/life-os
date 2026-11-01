/**
 * ScheduleConflictReportModel.ts
 * 
 * Derived state model for Temporal Schedule Conflicts and Governed Repair Plans.
 * Milestone B — Step 2 V2.2 Canonical Projection Model.
 * Enforces:
 * - Deterministic SHA-256 source partition manifest hash
 * - sweepRevision CAS tokens
 * - Human Governance Invariant: Consequential adjustments remain PENDING_CONFIRMATION until explicit user approval
 */

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IScheduleConflictItem {
  occurrenceIdA: string;
  occurrenceIdB: string;
  titleA: string;
  titleB: string;
  reason: string;
  overlapMinutes: number;
}

export interface IProposedAdjustment {
  occurrenceId: string;
  title: string;
  originalStartMinute: number;
  proposedStartMinute: number;
  reason: string;
}

export interface IRepairPlanSubdoc {
  planId: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "DISMISSED";
  requiresConfirmation: boolean;
  proposedAdjustments: IProposedAdjustment[];
}

export interface IScheduleConflictReportDoc extends Document {
  reportId: string;
  userId: string;
  dateOnly: string;
  hasConflicts: boolean;
  conflicts: IScheduleConflictItem[];
  repairPlan?: IRepairPlanSubdoc | null;
  sweepRevision: number;
  sourceManifestHash: string;
  lastSweptAt: Date;
  derivedFromCausalSequence?: number;
  lastEventId: string;
  lastAppliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleConflictReportSchema = new Schema<IScheduleConflictReportDoc>(
  {
    reportId: {
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
    dateOnly: {
      type: String,
      required: true,
      index: true,
    },
    hasConflicts: {
      type: Boolean,
      required: true,
      default: false,
    },
    conflicts: [
      {
        occurrenceIdA: { type: String, required: true },
        occurrenceIdB: { type: String, required: true },
        titleA: { type: String, required: true },
        titleB: { type: String, required: true },
        reason: { type: String, required: true },
        overlapMinutes: { type: Number, required: true },
      },
    ],
    repairPlan: {
      type: {
        planId: { type: String, required: true },
        status: {
          type: String,
          required: true,
          enum: ["PENDING_CONFIRMATION", "CONFIRMED", "DISMISSED"],
          default: "PENDING_CONFIRMATION",
        },
        requiresConfirmation: { type: Boolean, default: true },
        proposedAdjustments: [
          {
            occurrenceId: { type: String, required: true },
            title: { type: String, required: true },
            originalStartMinute: { type: Number, required: true },
            proposedStartMinute: { type: Number, required: true },
            reason: { type: String, required: true },
          },
        ],
      },
      default: null,
    },
    sweepRevision: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    sourceManifestHash: {
      type: String,
      default: "",
    },
    lastSweptAt: {
      type: Date,
      default: Date.now,
    },
    derivedFromCausalSequence: {
      type: Number,
      default: 0,
      index: true,
    },
    lastEventId: {
      type: String,
      required: true,
      default: "",
    },
    lastAppliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ScheduleConflictReportSchema.index({ userId: 1, dateOnly: 1 });
ScheduleConflictReportSchema.index({ reportId: 1, sweepRevision: 1 });

export const ScheduleConflictReportModel: Model<IScheduleConflictReportDoc> =
  mongoose.models.ScheduleConflictReport ||
  mongoose.model<IScheduleConflictReportDoc>(
    "ScheduleConflictReport",
    ScheduleConflictReportSchema
  );
