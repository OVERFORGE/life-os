import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { FoodItem } from "@/server/db/models/FoodItem";
import { saveNutritionLogWithOutbox } from "@/features/nutrition/services/nutritionLogEngine";

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
    
    // Ensure FoodItem is registered before populate
    console.log(`[NutritionLog] Models loaded: FoodItem=${FoodItem.modelName}`);
    
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

    const body = await req.json();
    const { date, meals, dailyTotals, clientMutationId, expectedVersion } = body;
    if (!date || !meals) {
      return Response.json({ error: "Date and meals array are required" }, { status: 400 });
    }

    await connectDB();

    const result = await saveNutritionLogWithOutbox({
      userId: session.user.id,
      date,
      meals,
      dailyTotals,
      options: {
        clientMutationId: typeof clientMutationId === "string" ? clientMutationId : undefined,
        expectedVersion: typeof expectedVersion === "number" ? expectedVersion : undefined,
        source: "web.nutrition.log",
      },
    });

    if (!result.success) {
      return Response.json(
        { error: result.error, code: result.code },
        { status: result.statusCode || 500 }
      );
    }

    return Response.json({ success: true, log: result.log });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
