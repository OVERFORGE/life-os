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

  const physicalSignals = [
    {
      key: "gymSession",
      label: "Went to Gym",
      inputType: "checkbox",
    },
    {
      key: "steps",
      label: "Steps Walked",
      inputType: "number",
      unit: "steps",
      target: 8000,
    },
    {
      key: "calories",
      label: "Calories Intake",
      inputType: "number",
      unit: "kcal",
      target: null,
    },
    {
      key: "meals",
      label: "Meals Eaten",
      inputType: "number",
      unit: "meals",
      target: null,
    },
    {
      key: "dietNote",
      label: "Diet Note",
      inputType: "textarea",
    },
    {
      key: "painNote",
      label: "Pain / Sickness Note",
      inputType: "textarea",
    },
  ];

  for (const s of physicalSignals) {
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
        key: s.key,
        label: s.label,
        categoryKey: "physical",
        inputType: s.inputType,
        unit: s.unit ?? "",
        target: s.target ?? null,
        enabled: true,
        isCore: false,
      },
      createIfMissing: true,
      options: {
        clientMutationId: `mut_seed_signal_${session.user.id}_${s.key}`,
        source: "web.signals.seed_physical",
      },
    });
  }

  return Response.json({ ok: true });
}
