import { Schema, model, models } from "mongoose";

const SessionSchema = new Schema(
  {
    userId:       { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionToken: { type: String, required: true, index: true }, // hashed JWT "jti" or token hash
    deviceType:   { type: String, enum: ["mobile", "desktop", "tablet", "web"], default: "web" },
    platform:     { type: String, default: "Web Browser" }, // "Web Browser" | "Desktop App" | "Mobile App"
    browser:      { type: String, default: "Unknown" },
    os:           { type: String, default: "Unknown" },
    ipAddress:    { type: String, default: "" },
    lastActive:   { type: Date, default: Date.now },
    isRevoked:    { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Session = models.Session || model("Session", SessionSchema);
