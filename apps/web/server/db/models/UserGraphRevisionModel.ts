import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserGraphRevisionDoc extends Document {
  userId: string;
  graphRevision: number;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserGraphRevisionSchema = new Schema<IUserGraphRevisionDoc>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    graphRevision: {
      type: Number,
      required: true,
      default: 0,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const UserGraphRevisionModel: Model<IUserGraphRevisionDoc> =
  mongoose.models.UserGraphRevision ||
  mongoose.model<IUserGraphRevisionDoc>(
    "UserGraphRevision",
    UserGraphRevisionSchema
  );

