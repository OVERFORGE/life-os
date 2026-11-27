import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { DayTemplate } from "@/server/db/models/DayTemplate";
import { createCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const templates = await DayTemplate.find({ userId: session.user.id }).populate("meals.foodItemId");

    return Response.json({ success: true, templates });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json(); // { name, meals }
    await connectDB();

    const res = await createCatalogDocWithOutbox({
      userId: session.user.id,
      model: DayTemplate,
      aggregateType: "day_template",
      eventType: "domain.catalog.updated",
      domain: "nutrition",
      docFields: { ...body, userId: session.user.id },
      options: { source: "web.nutrition.templates.create" },
    });

    return Response.json({ success: true, template: res.doc });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
