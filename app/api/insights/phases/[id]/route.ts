import { connectDB } from "@/server/db/connect";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { getAuthSession } from "@/lib/auth";
import { computeSnapshotDelta } from "@/features/insights/engine/computeSnapshotDelta";
import { explainPhaseTransition } from "@/features/insights/engine/explainPhaseTransition";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const current = await PhaseHistory.findOne({
    _id: params.id,
    userId: session.user.id,
  }).lean();

  if (!current) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

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

  return Response.json({
    phase: current,
    previousPhase: previous,
    delta,
    interpretation,
  });
}
