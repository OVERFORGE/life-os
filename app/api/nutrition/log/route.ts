import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { FoodItem } from "@/server/db/models/FoodItem";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const history = searchParams.get("history");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    await connectDB();
    
    console.log(`[NutritionLog GET] User: ${session.user.id}, Date: ${date}, Start: ${startDate}, End: ${endDate}`);

    if (startDate && endDate) {
      const logs = await NutritionLog.find({ 
        userId: session.user.id, 
        date: { $gte: startDate, $lte: endDate } 
      })
      .sort({ date: 1 })
      .populate("meals.foodItemId");
      console.log(`[NutritionLog GET] Found ${logs.length} logs for range`);
      return Response.json({ success: true, logs });
    }

    if (history) {
      const logs = await NutritionLog.find({ userId: session.user.id })
        .sort({ date: -1 })
        .limit(30)
        .populate("meals.foodItemId");
      return Response.json({ success: true, logs });
    }

    if (!date) {
      return Response.json({ error: "Date is required (YYYY-MM-DD)" }, { status: 400 });
    }

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

    // Cross-module sync: Update DailyLog
    import("@/server/db/models/DailyLog").then(async ({ DailyLog }) => {
      await DailyLog.findOneAndUpdate(
        { userId: session.user.id, date },
        { 
          $set: { "physical.calories": dailyTotals?.calories || 0 },
          $setOnInsert: { signals: {}, sleep: {}, mental: {}, work: {} }
        },
        { upsert: true }
      );
    });

    return Response.json({ success: true, log: updatedLog });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
