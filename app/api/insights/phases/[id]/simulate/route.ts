import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";
import { getAuthSession } from "@/lib/auth";
import { simulatePhaseIntervention } from "@/features/insights/engine/simulatePhaseInterventions";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  // ✅ MUST await params in new Next.js
  const { id } = await context.params;

  // ✅ Validate ObjectId
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

  const deltas = await req.json();

  const result = simulatePhaseIntervention({
    phase,
    deltas,
    baselines: settings?.baselines,
    thresholds: settings?.thresholds,
  });

  return Response.json({
    input: deltas,
    result,
  });
}
