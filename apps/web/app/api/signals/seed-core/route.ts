import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { LifeSignal } from "@/features/signals/models/LifeSignal";
import { upsertCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const coreSignals = [
    {
      key: "mood",
      label: "Mood",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      isCore: true,
    },
    {
      key: "energy",
      label: "Energy",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      isCore: true,
    },
    {
      key: "stress",
      label: "Stress",
      categoryKey: "mental-health",
      inputType: "slider",
      min: 1,
      max: 10,
      direction: "lower_better",
      isCore: true,
    },
    {
      key: "sleepHours",
      label: "Sleep Hours",
      categoryKey: "sleep",
      inputType: "number",
      unit: "hrs",
      target: 8,
      isCore: true,
    },
    {
      key: "deepWorkHours",
      label: "Deep Work Hours",
      categoryKey: "work",
      inputType: "number",
      unit: "hrs",
      isCore: true,
    },
  ];

  for (const s of coreSignals) {
    await upsertCatalogDocWithOutbox({
      userId: session.user.id,
      model: LifeSignal,
      filter: { userId: session.user.id, key: s.key },
      aggregateType: "life_signal",
      eventType: "domain.catalog.updated",
      domain: "signals",
      updateFields: {},
      createFields: { userId: session.user.id, ...s },
      createIfMissing: true,
      options: {
        clientMutationId: `mut_seed_signal_${session.user.id}_${s.key}`,
        source: "web.signals.seed_core",
      },
    });
  }

  return Response.json({ ok: true });
}
