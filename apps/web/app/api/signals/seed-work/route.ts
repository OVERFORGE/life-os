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

  const workSignals = [
    {
      key: "coded",
      label: "Did Coding",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "executioners",
      label: "Worked on Executioners",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "studied",
      label: "Studied / Learning",
      categoryKey: "work",
      inputType: "checkbox",
    },
    {
      key: "mainWork",
      label: "Main Work Focus",
      categoryKey: "work",
      inputType: "textarea",
    },
  ];

  for (const s of workSignals) {
    await upsertCatalogDocWithOutbox({
      userId: session.user.id,
      model: LifeSignal,
      filter: { userId: session.user.id, key: s.key },
      aggregateType: "life_signal",
      eventType: "domain.catalog.updated",
      domain: "signals",
      updateFields: {},
      createFields: {
        userId: session.user.id,
        ...s,
        enabled: true,
        isCore: false,
      },
      createIfMissing: true,
      options: {
        clientMutationId: `mut_seed_signal_${session.user.id}_${s.key}`,
        source: "web.signals.seed_work",
      },
    });
  }

  return Response.json({ ok: true });
}
