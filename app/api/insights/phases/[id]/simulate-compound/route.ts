import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { simulateCompoundInterventions } from "@/features/insights/engine/simulateCompoundInterventions";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  const phase = await PhaseHistory.findById(params.id).lean();

  if (!phase) {
    return Response.json({ error: "Phase not found" }, { status: 404 });
  }

  const settings = await LifeSettings.findOne({ userId }).lean();

  if (!settings) {
    return Response.json({ error: "Settings not found" }, { status: 404 });
  }

  /* ================================================= */
  /* ✅ FIX: REMOVE thresholds → USE sensitivity       */
  /* ================================================= */

  const result = simulateCompoundInterventions({
    phase,
    baselines: settings.baselines,
    sensitivity: settings.learnedSensitivity, // ✅ correct field
  });

  return Response.json({
    ok: true,
    result,
  });
}