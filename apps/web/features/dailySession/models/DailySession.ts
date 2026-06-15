import mongoose from "mongoose";

const DailySessionSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        date: { type: String, required: true },

        wakeTime: { type: String },
        sleepTime: { type: String },

        isComplete: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const DailySession =
    mongoose.models.DailySession ||
    mongoose.model("DailySession", DailySessionSchema);