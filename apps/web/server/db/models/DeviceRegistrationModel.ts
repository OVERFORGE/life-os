import mongoose, { Schema, Document, Model } from "mongoose";

export type DevicePlatformType = "ANDROID" | "IOS" | "DESKTOP" | "WEB";

export interface IDeviceRegistrationDoc extends Document {
  userId: string;
  deviceId: string;
  platform: DevicePlatformType;
  pushToken?: string;
  webPushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  deviceName?: string;
  appVersion?: string;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceRegistrationSchema = new Schema<IDeviceRegistrationDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["ANDROID", "IOS", "DESKTOP", "WEB"],
      required: true,
    },
    pushToken: {
      type: String,
      trim: true,
    },
    webPushSubscription: {
      endpoint: { type: String },
      keys: {
        p256dh: { type: String },
        auth: { type: String },
      },
    },
    deviceName: {
      type: String,
      trim: true,
    },
    appVersion: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index so each device has at most one record per user
DeviceRegistrationSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export const DeviceRegistration: Model<IDeviceRegistrationDoc> =
  mongoose.models.DeviceRegistration ||
  mongoose.model<IDeviceRegistrationDoc>("DeviceRegistration", DeviceRegistrationSchema);
