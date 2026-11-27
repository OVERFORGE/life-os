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

  const habitSignals = [
    { key: "gymHabit", label: "Gym", inputType: "checkbox" },
    { key: "reading", label: "Reading", inputType: "checkbox" },
    { key: "meditationHabit", label: "Meditation", inputType: "checkbox" },
    { key: "codingHabit", label: "Coding Practice", inputType: "checkbox" },
    { key: "content", label: "Content Creation", inputType: "checkbox" },
    { key: "learning", label: "Learning / Study", inputType: "checkbox" },
    { key: "noFap", label: "NoFap", inputType: "checkbox" },
    {
      key: "socialMediaOveruse",
      label: "Social Media Overuse",
      inputType: "checkbox",
      direction: "lower_better",
    },
    {
      key: "junkFood",
      label: "Ate Junk Food",
      inputType: "checkbox",
      direction: "lower_better",
    },
  ];

  for (const s of habitSignals) {
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
        categoryKey: "habits",
        inputType: s.inputType,
        direction: s.direction ?? "higher_better",
        enabled: true,
        isCore: false,
      },
      createIfMissing: true,
      options: {
        clientMutationId: `mut_seed_signal_${session.user.id}_${s.key}`,
        source: "web.signals.seed_habits",
      },
    });
  }

  return Response.json({ ok: true });
}
