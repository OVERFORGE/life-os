import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";

import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { simulateCompoundInterventions } from "@/features/insights/engine/simulateCompoundInterventions";

import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ FIX
) {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  /* ================================================= */
  /* ✅ FIX: await params                              */
  /* ================================================= */

  const { id } = await context.params;

  const phase = await PhaseHistory.findById(id).lean();

  if (!phase) {
    return Response.json({ error: "Phase not found" }, { status: 404 });
  }

  const settings = await LifeSettings.findOne({ userId }).lean();

  if (!settings) {
    return Response.json({ error: "Settings not found" }, { status: 404 });
  }

  const result = simulateCompoundInterventions({
    phase,
    baselines: settings.baselines,
    sensitivity: settings.learnedSensitivity,
  });

  return Response.json({
    ok: true,
    result,
  });
}