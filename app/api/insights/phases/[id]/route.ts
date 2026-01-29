import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { getAuthSession } from "@/lib/auth";
import { computeSnapshotDelta } from "@/features/insights/engine/computeSnapshotDelta";
import { explainPhaseTransition } from "@/features/insights/engine/explainPhaseTransition";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { forecastLifeTrajectory } from "@/features/insights/engine/forecastLifeTrajectory";

import mongoose from "mongoose";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { id } = await context.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const _id = new mongoose.Types.ObjectId(id);

  const current = await PhaseHistory.findOne({
    _id,
    userId: session.user.id,
  }).lean();

  if (!current) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allPhases = await PhaseHistory.find({
    userId: session.user.id,
  }).sort({ startDate: 1 }).lean();

  const previous = await PhaseHistory.findOne({
    userId: session.user.id,
    createdAt: { $lt: current.createdAt },
  })
    .sort({ createdAt: -1 })
    .lean();

  const delta = previous
    ? computeSnapshotDelta(previous.snapshot, current.snapshot)
    : null;

  const interpretation = previous
    ? explainPhaseTransition({
        prev: previous,
        current,
        delta,
      })
    : null;

  const selfExplanation = explainLifePhase(current);
  const forecast = forecastLifeTrajectory(allPhases);

  return Response.json({
    phase: {
      ...current,
      _id: current._id.toString(),
    },
    previousPhase: previous
      ? { ...previous, _id: previous._id.toString() }
      : null,
    delta,
    interpretation,
    selfExplanation,
    forecast,
  });
}
