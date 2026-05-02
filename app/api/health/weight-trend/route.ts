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

  // Fetch last 60 days to ensure we have enough anchor points for segments
  const now = new Date();
  const sixtyAgo = new Date(now);
  sixtyAgo.setDate(sixtyAgo.getDate() - 60);

  const startStr = sixtyAgo.toISOString().split("T")[0];
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

  const calMap: Record<string, number> = {};
  for (const log of nutritionLogs) {
    calMap[log.date] = log.dailyTotals?.calories || 0;
  }

  const allWeights = weightLogs.map(w => w.weight);
  const monthlyAvg = allWeights.length
    ? parseFloat((allWeights.reduce((s, v) => s + v, 0) / allWeights.length).toFixed(1))
    : null;

  // 1. Calculate static maintenance segments
  const segments: Array<{
    startDate: string;
    endDate: string;
    maintenanceEstimate: number | null;
  }> = [];

  if (weightLogs.length >= 2) {
    let currentStartLog = weightLogs[0];
    for (let i = 1; i < weightLogs.length; i++) {
      const log = weightLogs[i];
      const daysGap = Math.round((new Date(log.date).getTime() - new Date(currentStartLog.date).getTime()) / 86400000);
      
      // Enforce at least 7 days difference for a valid maintenance calculation
      if (daysGap >= 7) {
        let totalCals = 0;
        let countedDays = 0;
        const cur = new Date(currentStartLog.date);
        const end = new Date(log.date);
        while (cur <= end) {
          const dStr = cur.toISOString().split("T")[0];
          if (calMap[dStr] > 0) {
            totalCals += calMap[dStr];
            countedDays++;
          }
          cur.setDate(cur.getDate() + 1);
        }

        let maintenanceEstimate = null;
        if (countedDays > 0) {
          const avgCals = Math.round(totalCals / countedDays);
          const deltaKg = log.weight - currentStartLog.weight;
          const dailyDelta = Math.round((deltaKg * 7700) / daysGap);
          maintenanceEstimate = Math.max(1200, avgCals - dailyDelta);
        }

        segments.push({
          startDate: currentStartLog.date,
          endDate: log.date,
          maintenanceEstimate
        });

        // Start new segment
        currentStartLog = log;
      }
    }
  }

  // Helper to find the active maintenance for a given date
  const getMaintenanceForDate = (dateStr: string) => {
    // Find a segment that covers this date
    for (const seg of segments) {
      if (dateStr >= seg.startDate && dateStr <= seg.endDate) {
        return seg.maintenanceEstimate;
      }
    }
    // If no segment covers it (e.g. current week without a second weigh-in yet), 
    // use the most recent available segment's estimate
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].maintenanceEstimate !== null) {
        return segments[i].maintenanceEstimate;
      }
    }
    return null;
  };

  // 2. Build 5 weeks back from today for the UI Graph
  const weeklyData: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    startWeight: number | null;
    endWeight: number | null;
    avgCalories: number | null;
    maintenanceEstimate: number | null;
  }> = [];

  for (let w = 4; w >= 0; w--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    const wStartStr = weekStart.toISOString().split("T")[0];
    const wEndStr = weekEnd.toISOString().split("T")[0];

    const weekWeights = weightLogs.filter(wl => wl.date >= wStartStr && wl.date <= wEndStr);
    const weekCals: number[] = [];
    const cur = new Date(weekStart);
    while (cur <= weekEnd) {
      const d = cur.toISOString().split("T")[0];
      if (calMap[d] && calMap[d] > 0) weekCals.push(calMap[d]);
      cur.setDate(cur.getDate() + 1);
    }

    const avgCals = weekCals.length > 0 ? Math.round(weekCals.reduce((s, v) => s + v, 0) / weekCals.length) : null;
    const startW = weekWeights[0]?.weight ?? null;
    const endW = weekWeights[weekWeights.length - 1]?.weight ?? null;

    // Apply the static segment-based maintenance estimate to this week
    const maintenanceEstimate = getMaintenanceForDate(wEndStr);

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
    // Only return the last 35 days of weights for the UI scatter plot to prevent crowding
    weightLogs: weightLogs.filter(w => w.date >= new Date(now.getTime() - 35 * 86400000).toISOString().split("T")[0]).map(w => ({ date: w.date, weight: w.weight })),
    monthlyAvg,
    weeklyData,
  });
}
