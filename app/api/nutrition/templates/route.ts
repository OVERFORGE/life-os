import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { DayTemplate } from "@/server/db/models/DayTemplate";

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

    const newTemplate = await DayTemplate.create({
      ...body,
      userId: session.user.id,
    });

    return Response.json({ success: true, template: newTemplate });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
