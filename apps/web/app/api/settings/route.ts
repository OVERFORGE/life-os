import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { LifeSystemSettings } from "@/features/settings/models/LifeSystemSettings";
import { getEffectiveSettings } from "@/features/settings/getEffectiveSettings";
import { DEFAULT_SYSTEM_SETTINGS } from "@/features/settings/defaultSystemSettings";
import { upsertCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const doc =
    (await LifeSystemSettings.findOne({
      userId: session.user.id,
    }).lean()) || null;

  const effective = getEffectiveSettings({
    learned: doc?.learned,
    overrides: doc?.overrides,
  });

  return Response.json({
    defaults: DEFAULT_SYSTEM_SETTINGS,
    learned: doc?.learned || {},
    overrides: doc?.overrides || {},
    effective,
  });
}


export async function PUT(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body: any = await req.json();

  await connectDB();

  await upsertCatalogDocWithOutbox({
    userId: session.user.id,
    model: LifeSystemSettings,
    filter: { userId: session.user.id },
    aggregateType: "system_settings",
    eventType: "domain.settings.updated",
    domain: "settings",
    updateFields: { overrides: body },
    createFields: { userId: session.user.id, learned: {} },
    createIfMissing: true,
    options: { source: "web.settings.put" },
  });

  return Response.json({ ok: true });
}

export async function DELETE() {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  await upsertCatalogDocWithOutbox({
    userId: session.user.id,
    model: LifeSystemSettings,
    filter: { userId: session.user.id },
    aggregateType: "system_settings",
    eventType: "domain.settings.updated",
    domain: "settings",
    updateFields: { overrides: {} },
    createIfMissing: false,
    options: { source: "web.settings.delete" },
  });

  return Response.json({ ok: true });
}
