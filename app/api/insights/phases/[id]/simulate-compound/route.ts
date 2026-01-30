import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";
import { getAuthSession } from "@/lib/auth";
import { simulateCompoundInterventions } from "@/features/insights/engine/simulateCompoundInterventions";

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

  const phase = await PhaseHistory.findOne({
    _id,
    userId: session.user.id,
  }).lean();

  if (!phase) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await LifeSettings.findOne({
    userId: session.user.id,
  }).lean();

  if (!settings) {
    return Response.json({ error: "No settings found" }, { status: 400 });
  }

  const simulations = simulateCompoundInterventions({
    phase,
    baselines: settings.baselines,
    thresholds: settings.thresholds,
  });

  return Response.json({
    phaseId: id,
    simulations,
  });
}
