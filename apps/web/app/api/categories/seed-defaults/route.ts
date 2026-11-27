import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { LifeCategory } from "@/features/schema/models/LifeCategory";
import { upsertCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export async function POST() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const defaults = [
    { key: "mental-health", label: "Mental Health", order: 0 },
    { key: "sleep", label: "Sleep & Recovery", order: 1 },
    { key: "work", label: "Work & Execution", order: 2 },
    { key: "habits", label: "Habits & Discipline", order: 3 },
    { key: "physical", label: "Physical Health", order: 4 },
  ];

  for (const c of defaults) {
    await upsertCatalogDocWithOutbox({
      userId: session.user.id,
      model: LifeCategory,
      filter: { userId: session.user.id, key: c.key },
      aggregateType: "life_category",
      eventType: "domain.catalog.updated",
      domain: "signals",
      updateFields: {},
      createFields: { userId: session.user.id, ...c },
      createIfMissing: true,
      options: {
        clientMutationId: `mut_seed_category_${session.user.id}_${c.key}`,
        source: "web.categories.seed_defaults",
      },
    });
  }

  return Response.json({ ok: true });
}
