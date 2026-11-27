import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { FoodItem } from "@/server/db/models/FoodItem";
import { createCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const foods = await FoodItem.find({ userId: session.user.id }).sort({ createdAt: -1 });

    return Response.json({ success: true, foods });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    await connectDB();

    const res = await createCatalogDocWithOutbox({
      userId: session.user.id,
      model: FoodItem,
      aggregateType: "food_item",
      eventType: "domain.catalog.updated",
      domain: "nutrition",
      docFields: { ...body, userId: session.user.id },
      options: { source: "web.nutrition.library.create" },
    });

    return Response.json({ success: true, food: res.doc });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
