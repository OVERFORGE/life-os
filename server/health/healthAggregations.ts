import { NutritionLog } from "@/server/db/models/NutritionLog";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { WeightLog } from "@/server/db/models/WeightLog";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

// Retrieves current total macro intake
export async function getTodayCalories(userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const todayStr = getActiveDate(user?.settings?.timezone);
    const log = await NutritionLog.findOne({ userId, date: todayStr }).lean();
    return log?.dailyTotals?.calories || 0;
}

// Retrieves gym volume stats
export async function getGymStats(userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const todayStr = getActiveDate(user?.settings?.timezone);
    const todayObj = new Date(todayStr + "T23:59:59Z");
    
    const thirtyDaysAgo = new Date(todayObj);
    thirtyDaysAgo.setUTCDate(todayObj.getUTCDate() - 30);
    const sevenDaysAgo = new Date(todayObj);
    sevenDaysAgo.setUTCDate(todayObj.getUTCDate() - 7);

    // WorkoutSession.date is a Date field — query with Date objects
    const workouts = await WorkoutSession.find({
        userId,
        date: { $gte: thirtyDaysAgo }
    }).lean();

    const last30Days = workouts.length;
    const last7Days = workouts.filter(w => new Date(w.date as any) >= sevenDaysAgo).length;
    
    // Baseline 16 workouts per month = 100% consistency score
    const consistencyScore = Math.min(100, Math.round((last30Days / 16) * 100)); 

    return { last7Days, last30Days, consistencyScore };
}

// Retrieves rolling 7-day weight average and classification
export async function getWeightTrend(userId: string) {
    const logs = await WeightLog.find({ userId }).sort({ date: -1 }).limit(7).lean();
    
    if (!logs || logs.length === 0) {
        // Fallback to User.weight if no dedicated WeightLog yet
        const user = await User.findById(userId).select("weight").lean();
        const fallback = user?.weight || null;
        return { currentWeight: fallback, last7Avg: fallback, trend: "stable" };
    }
    
    const currentWeight = logs[0].weight;
    if (logs.length === 1) {
        return { currentWeight, last7Avg: currentWeight, trend: "stable" };
    }

    const sum = logs.reduce((acc, log) => acc + log.weight, 0);
    const last7Avg = Number((sum / logs.length).toFixed(1));
    const oldWeight = logs[logs.length - 1].weight;
    
    let trend = "stable";
    if (currentWeight <= oldWeight - 0.4) trend = "down";
    else if (currentWeight >= oldWeight + 0.4) trend = "up";

    return { currentWeight, last7Avg, trend };
}

// Evaluates macro variance
export async function getCalorieStatus(userId: string) {
    const user = await User.findById(userId).select("targetCalories").lean();
    const todayCal = await getTodayCalories(userId);
    const target = user?.targetCalories || 2000;
    
    const difference = todayCal - target;
    let status = "on_track";
    if (difference < -150) status = "deficit";
    else if (difference > 150) status = "surplus";

    return { status, difference: Number(difference.toFixed(0)) };
}

// Computes rolling weekly and monthly macro averages for LLM context
export async function getNutritionAverages(userId: string) {
    const now = new Date();
    const sevenAgo = new Date(now); sevenAgo.setDate(now.getDate() - 7);
    const thirtyAgo = new Date(now); thirtyAgo.setDate(now.getDate() - 30);

    const sevenStr  = sevenAgo.toISOString().split('T')[0];
    const thirtyStr = thirtyAgo.toISOString().split('T')[0];
    const nowStr    = now.toISOString().split('T')[0];

    const [weekLogs, monthLogs] = await Promise.all([
        NutritionLog.find({ userId, date: { $gte: sevenStr,  $lte: nowStr } }).select('dailyTotals').lean(),
        NutritionLog.find({ userId, date: { $gte: thirtyStr, $lte: nowStr } }).select('dailyTotals').lean(),
    ]);

    function avg(logs: any[], key: string) {
        const vals = logs.map(l => l.dailyTotals?.[key] || 0).filter(v => v > 0);
        if (!vals.length) return 0;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    return {
        weekly: {
            calories: avg(weekLogs, 'calories'),
            protein:  avg(weekLogs, 'protein'),
            carbs:    avg(weekLogs, 'carbs'),
            fats:     avg(weekLogs, 'fats'),
            daysLogged: weekLogs.length,
        },
        monthly: {
            calories: avg(monthLogs, 'calories'),
            protein:  avg(monthLogs, 'protein'),
            carbs:    avg(monthLogs, 'carbs'),
            fats:     avg(monthLogs, 'fats'),
            daysLogged: monthLogs.length,
        },
    };
}

