import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICadenceRoutineDoc {
  category: "SLEEP" | "PREP" | "MEAL" | "COMMUTE" | "GYM" | "WIND_DOWN" | "FOCUS";
  title: string;
  targetStartMinute: number;
  targetEndMinute: number;
  durationMinutes: number;
  elasticityRatio: number; // 0.0 (rigid) to 1.0 (elastic)
  confidence: number; // 0.0 to 1.0 based on observation sample size
  varianceMinutes: number;
}

export interface IDayCadencePatternDoc {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  baselineWakeMinute: number;
  baselineSleepMinute: number;
  routines: ICadenceRoutineDoc[];
  preferredFocusWindows: Array<{ startMinute: number; endMinute: number }>;
  commuteEstimates: Array<{ fromLocation: string; toLocation: string; durationMinutes: number }>;
  sampleCount: number;
}

export interface ICadenceProfileDoc extends Document {
  userId: string;
  dayPatterns: IDayCadencePatternDoc[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CadenceRoutineSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["SLEEP", "PREP", "MEAL", "COMMUTE", "GYM", "WIND_DOWN", "FOCUS"],
      required: true,
    },
    title: { type: String, required: true },
    targetStartMinute: { type: Number, required: true, min: 0, max: 1439 },
    targetEndMinute: { type: Number, required: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    elasticityRatio: { type: Number, default: 0.5, min: 0, max: 1 },
    confidence: { type: Number, default: 0.5, min: 0, max: 1 },
    varianceMinutes: { type: Number, default: 15 },
  },
  { _id: false }
);

const DayCadencePatternSchema = new Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    baselineWakeMinute: { type: Number, default: 480 }, // 8:00 AM
    baselineSleepMinute: { type: Number, default: 1410 }, // 11:30 PM
    routines: { type: [CadenceRoutineSchema], default: [] },
    preferredFocusWindows: {
      type: [{ startMinute: Number, endMinute: Number }],
      default: [{ startMinute: 600, endMinute: 720 }], // Default: 10 AM - 12 PM
    },
    commuteEstimates: {
      type: [{ fromLocation: String, toLocation: String, durationMinutes: Number }],
      default: [],
    },
    sampleCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const CadenceProfileSchema = new Schema<ICadenceProfileDoc>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    dayPatterns: {
      type: [DayCadencePatternSchema] as any,
      default: () => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ dayOfWeek: day, routines: [], sampleCount: 0 })),
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const CadenceProfile: Model<ICadenceProfileDoc> =
  mongoose.models.CadenceProfile ||
  mongoose.model<ICadenceProfileDoc>("CadenceProfile", CadenceProfileSchema);
