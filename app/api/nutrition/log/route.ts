import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { NutritionLog } from "@/server/db/models/NutritionLog";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    if (!date) {
      return Response.json({ error: "Date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    await connectDB();
    const log = await NutritionLog.findOne({ userId: session.user.id, date })
      .populate("meals.foodItemId");

    return Response.json({ success: true, log });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { date, meals, dailyTotals } = await req.json();
    if (!date || !meals) {
      return Response.json({ error: "Date and meals array are required" }, { status: 400 });
    }

    await connectDB();

    // Use findOneAndUpdate with upsert to create or successfully replace the day's existing log
    const updatedLog = await NutritionLog.findOneAndUpdate(
      { userId: session.user.id, date },
      { meals, dailyTotals },
      { new: true, upsert: true }
    );

    return Response.json({ success: true, log: updatedLog });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
