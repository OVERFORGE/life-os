import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { FoodItem } from "@/server/db/models/FoodItem";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    await connectDB();

    const updatedFood = await FoodItem.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: body },
      { new: true }
    );

    if (!updatedFood) {
      return Response.json({ error: "Food item not found or unauthorized" }, { status: 404 });
    }

    return Response.json({ success: true, food: updatedFood });
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
    const deletedFood = await FoodItem.findOneAndDelete({ _id: id, userId: session.user.id });

    if (!deletedFood) {
      return Response.json({ error: "Food item not found or unauthorized" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
