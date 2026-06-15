import mongoose, { Schema, model, models } from "mongoose";

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ["system", "reminder", "alert"], default: "reminder" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const NotificationLog = models.NotificationLog || model("NotificationLog", NotificationSchema);
