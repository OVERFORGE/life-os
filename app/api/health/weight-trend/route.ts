import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { WeightLog } from "@/server/db/models/WeightLog";
import { NutritionLog } from "@/server/db/models/NutritionLog";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Fetch last 35 days of data
  const now = new Date();
  const thirtyFiveAgo = new Date(now);
  thirtyFiveAgo.setDate(thirtyFiveAgo.getDate() - 35);

  const startStr = thirtyFiveAgo.toISOString().split("T")[0];
  const endStr = now.toISOString().split("T")[0];

  const [weightLogs, nutritionLogs] = await Promise.all([
    WeightLog.find({ userId, date: { $gte: startStr, $lte: endStr } })
      .sort({ date: 1 })
      .lean(),
    NutritionLog.find({ userId, date: { $gte: startStr, $lte: endStr } })
      .select("date dailyTotals")
      .sort({ date: 1 })
      .lean(),
  ]);

  // Build a map of date → calories
  const calMap: Record<string, number> = {};
  for (const log of nutritionLogs) {
    calMap[log.date] = log.dailyTotals?.calories || 0;
  }

  // Monthly average weight
  const allWeights = weightLogs.map(w => w.weight);
  const monthlyAvg = allWeights.length
    ? parseFloat((allWeights.reduce((s, v) => s + v, 0) / allWeights.length).toFixed(1))
    : null;

  // Compute maintenance estimates per week
  // Group weight logs by week (using Sunday-anchored ISO weeks)
  const weeklyData: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    startWeight: number | null;
    endWeight: number | null;
    avgCalories: number | null;
    maintenanceEstimate: number | null;
  }> = [];

  // Build 5 weeks back from today
  for (let w = 4; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    const wStartStr = weekStart.toISOString().split("T")[0];
    const wEndStr = weekEnd.toISOString().split("T")[0];

    // Get weight logs within this week
    const weekWeights = weightLogs.filter(
      wl => wl.date >= wStartStr && wl.date <= wEndStr
    );

    // Get calorie logs within this week
    const weekCals: number[] = [];
    const cur = new Date(weekStart);
    while (cur <= weekEnd) {
      const d = cur.toISOString().split("T")[0];
      if (calMap[d] && calMap[d] > 0) weekCals.push(calMap[d]);
      cur.setDate(cur.getDate() + 1);
    }

    const avgCals = weekCals.length > 0
      ? Math.round(weekCals.reduce((s, v) => s + v, 0) / weekCals.length)
      : null;

    const startW = weekWeights[0]?.weight ?? null;
    const endW = weekWeights[weekWeights.length - 1]?.weight ?? null;

    // Maintenance estimate: 
    // deltaWeight (kg) × 7700 kcal/kg / 7 days = daily surplus/deficit
    // maintenance ≈ avgDailyCalories - dailySurplus
    let maintenanceEstimate: number | null = null;
    if (avgCals !== null && startW !== null && endW !== null && startW !== endW) {
      const deltaKg = endW - startW;
      const dailyDelta = Math.round((deltaKg * 7700) / 7);
      maintenanceEstimate = Math.max(1200, avgCals - dailyDelta);
    } else if (avgCals !== null && startW !== null && endW !== null) {
      // Stable weight → avg calories ≈ maintenance
      maintenanceEstimate = avgCals;
    }

    const weekNum = 5 - w;
    weeklyData.push({
      weekLabel: `Wk${weekNum} (${wStartStr.slice(5)})`,
      startDate: wStartStr,
      endDate: wEndStr,
      startWeight: startW,
      endWeight: endW,
      avgCalories: avgCals,
      maintenanceEstimate,
    });
  }

  return NextResponse.json({
    weightLogs: weightLogs.map(w => ({ date: w.date, weight: w.weight })),
    monthlyAvg,
    weeklyData,
  });
}
