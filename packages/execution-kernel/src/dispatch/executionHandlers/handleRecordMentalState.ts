import mongoose from "mongoose";
import { RecordMentalStatePayload } from "../../orchestration/contracts/ActionPayloadSchemas";

export async function handleRecordMentalState(payload: RecordMentalStatePayload, userId: string) {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error("[KERNEL_DATABASE_DISCONNECTED]: Cannot record mental state while MongoDB is disconnected.");
  }

  const { DailyLog } = await import("@/server/db/models/DailyLog");

  const today = payload.date || new Date().toISOString().split("T")[0];
  const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const updateFields: Record<string, any> = {};

  const toNum = (val: any) => {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string" && !isNaN(Number(val)) && val.trim() !== "") return Number(val);
    return undefined;
  };

  const moodVal = toNum(payload.mood);
  const energyVal = toNum(payload.energy);
  const stressVal = toNum(payload.stress);
  const focusVal = toNum(payload.focus);
  const anxietyVal = toNum(payload.anxiety);

  if (moodVal !== undefined) updateFields["mental.mood"] = moodVal;
  if (energyVal !== undefined) updateFields["mental.energy"] = energyVal;
  if (stressVal !== undefined) updateFields["mental.stress"] = stressVal;
  if (focusVal !== undefined) updateFields["mental.focus"] = focusVal;
  if (anxietyVal !== undefined) updateFields["mental.anxiety"] = anxietyVal;
  if (payload.notes) updateFields["mental.notes"] = payload.notes;

  if (Object.keys(updateFields).length === 0) {
    // If no specific numeric metric was given, ensure at least one default indicator is marked
    updateFields["mental.updatedAt"] = new Date().toISOString();
  }

  const updatedDoc = await DailyLog.findOneAndUpdate(
    { userId: userObjId, date: today },
    { $set: updateFields },
    { upsert: true, returnDocument: 'after' }
  );

  return {
    type: "record_mental_estimate",
    success: true,
    data: {
      logId: updatedDoc._id.toString(),
      date: today,
      mental: updatedDoc.mental,
      appliedFields: Object.keys(updateFields),
    },
  };
}
