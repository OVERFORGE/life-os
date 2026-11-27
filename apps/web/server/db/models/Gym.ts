import mongoose from "mongoose";

const GymSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // e.g. "Planet Fitness", "Home Garage"
    customEquipment: [{ name: { type: String }, category: { type: String } }], // user created specific equipment with category
    selectedPreSeeded: [{ type: String }], // standard database of things like "Bench Press", "Dumbbells"
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const Gym = mongoose.models.Gym || mongoose.model("Gym", GymSchema);
