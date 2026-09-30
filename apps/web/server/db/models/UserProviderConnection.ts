import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserProviderConnectionDoc extends Document {
  userId: string;
  providerId: string;
  providerDisplayName: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "RATE_LIMITED" | "SUSPENDED";
  authType: "OAUTH2" | "API_KEY" | "LOCAL_STDIO" | "PAT";
  connectedAccount?: string;
  encryptedTokenPayload: string;
  tokenIv: string;
  tokenAuthTag: string;
  keyVersion: number;
  grantedScopes: string[];
  expiresAt?: Date;
  lastSuccessfulSync?: Date;
  consecutiveFailures: number;
  preferences?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const UserProviderConnectionSchema = new Schema<IUserProviderConnectionDoc>(
  {
    userId: { type: String, required: true, index: true },
    providerId: { type: String, required: true, index: true },
    providerDisplayName: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["ACTIVE", "REVOKED", "EXPIRED", "RATE_LIMITED", "SUSPENDED"],
      default: "ACTIVE",
    },
    authType: { type: String, required: true },
    connectedAccount: { type: String },
    encryptedTokenPayload: { type: String, default: "" },
    tokenIv: { type: String, default: "" },
    tokenAuthTag: { type: String, default: "" },
    keyVersion: { type: Number, default: 1 },
    grantedScopes: [{ type: String }],
    expiresAt: { type: Date },
    lastSuccessfulSync: { type: Date },
    consecutiveFailures: { type: Number, default: 0 },
    preferences: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

UserProviderConnectionSchema.index({ userId: 1, providerId: 1 }, { unique: true });

export const UserProviderConnection: Model<IUserProviderConnectionDoc> =
  mongoose.models.UserProviderConnection ||
  mongoose.model<IUserProviderConnectionDoc>("UserProviderConnection", UserProviderConnectionSchema);
