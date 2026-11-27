import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { FoodItem } from "@/server/db/models/FoodItem";
import {
  deleteCatalogDocWithOutbox,
  upsertCatalogDocWithOutbox,
} from "@/features/catalog/services/catalogMutationEngine";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await connectDB();

    const res = await upsertCatalogDocWithOutbox({
      userId: session.user.id,
      model: FoodItem,
      filter: { _id: id, userId: session.user.id },
      aggregateType: "food_item",
      eventType: "domain.catalog.updated",
      domain: "nutrition",
      updateFields: body,
      options: { source: "web.nutrition.library.update" },
    });

    if (res.notFound) {
      return Response.json({ error: "Food item not found or unauthorized" }, { status: 404 });
    }

    return Response.json({ success: true, food: res.doc });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await connectDB();
    const res = await deleteCatalogDocWithOutbox({
      userId: session.user.id,
      model: FoodItem,
      filter: { _id: id, userId: session.user.id },
      aggregateType: "food_item",
      eventType: "domain.catalog.updated",
      domain: "nutrition",
      options: { source: "web.nutrition.library.delete" },
    });

    if (res.notFound) {
      return Response.json({ error: "Food item not found or unauthorized" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
