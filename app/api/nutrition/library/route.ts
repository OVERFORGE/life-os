import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { FoodItem } from "@/server/db/models/FoodItem";

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

    const newFood = await FoodItem.create({
      ...body,
      userId: session.user.id,
    });

    return Response.json({ success: true, food: newFood });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
