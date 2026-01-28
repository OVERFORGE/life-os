import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

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

  const enriched = phases.map((p, i) => {
    const end = p.endDate || today;

    return {
      ...p,
      durationDays: daysBetween(p.startDate, end),
      isCurrent: !p.endDate,
    };
  });

  return NextResponse.json(enriched);
}
