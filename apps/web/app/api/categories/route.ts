// app/api/categories/route.ts

import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { LifeCategory } from "@/features/schema/models/LifeCategory";
import {
  createCatalogDocWithOutbox,
  deleteCatalogDocWithOutbox,
} from "@/features/catalog/services/catalogMutationEngine";

/* ======================= */
/* GET Categories          */
/* ======================= */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const categories = await LifeCategory.find({
    userId: session.user.id,
  })
    .sort({ order: 1 })
    .lean();

  return Response.json({ categories });
}

/* ======================= */
/* CREATE Category         */
/* ======================= */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body: any = await req.json();
  await connectDB();

  const res = await createCatalogDocWithOutbox({
    userId: session.user.id,
    model: LifeCategory,
    aggregateType: "life_category",
    eventType: "domain.catalog.updated",
    domain: "signals",
    docFields: {
      userId: session.user.id,
      key: body.key,
      label: body.label,
      order: body.order ?? 0,
    },
    options: { source: "web.categories.create" },
  });

  return Response.json({ ok: true, category: res.doc });
}

/* ======================= */
/* DELETE Category         */
/* ======================= */
export async function DELETE(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return Response.json({ error: "Key required" }, { status: 400 });
  }

  await connectDB();

  await deleteCatalogDocWithOutbox({
    userId: session.user.id,
    model: LifeCategory,
    filter: { userId: session.user.id, key },
    aggregateType: "life_category",
    eventType: "domain.catalog.updated",
    domain: "signals",
    options: { source: "web.categories.delete" },
  });

  return Response.json({ ok: true });
}
