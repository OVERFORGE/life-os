import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";


function daysBetween(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = Math.abs(d2.getTime() - d1.getTime());
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const phases = await PhaseHistory.find({ userId: session.user.id })
    .sort({ startDate: 1 })
    .lean();

  const today = new Date().toISOString().slice(0, 10);

  // ✅ 1. Enrich + FORCE _id TO STRING
  const enriched = phases.map((p: any) => {
    const end = p.endDate || today;

    return {
      ...p,
      _id: p._id.toString(),     // ✅ THIS FIXES EVERYTHING
      startDate: p.startDate,
      endDate: p.endDate,
      durationDays: daysBetween(p.startDate, end),
      isCurrent: !p.endDate,
    };
  });

  // 🧠 2. Run shape engine
  // 🧠 2. Attach intelligence to each phase
  const enrichedWithIntel = enriched.map((p) => {
    const explanation = explainLifePhase(p);

    const riskLevel =
      explanation.scores.load > 0.8
        ? "high"
        : explanation.scores.load > 0.6
        ? "medium"
        : "low";

    return {
      ...p,
      intelligence: explanation,
      riskLevel,
    };
  });

  return NextResponse.json({
    timeline: enrichedWithIntel,
  });

}
