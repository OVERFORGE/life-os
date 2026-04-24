import { getTodayCalories, getGymStats, getWeightTrend, getCalorieStatus, getNutritionAverages } from "./healthAggregations";
import { User } from "@/server/db/models/User";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { WeightLog } from "@/server/db/models/WeightLog";
import { getActiveDate } from "@/server/automation/timeUtils";

export async function buildHealthContext(userId: string) {
    const user = await User.findById(userId)
        .select("height heightUnit weight targetCalories maintenanceCalories dietMode dietModeCalorieOffset settings")
        .lean();
    
    const biometrics = {
        height: user?.height || null,
        heightUnit: user?.heightUnit || 'cm',
        weight: user?.weight || null,
        targetCalories: user?.targetCalories || 2000,
        maintenanceCalories: user?.maintenanceCalories || 2200,
        dietMode: (user as any)?.dietMode || 'recomp',
        dietModeCalorieOffset: (user as any)?.dietModeCalorieOffset || 0,
    };

    const calories = await getTodayCalories(userId);
    const calorieStatus = await getCalorieStatus(userId);
    const gym = await getGymStats(userId);
    const weight = await getWeightTrend(userId);
    const nutritionAverages = await getNutritionAverages(userId);

    const todayStr = getActiveDate(user?.settings?.timezone);
    
    const recentNutrition = await NutritionLog.findOne({ userId, date: todayStr }).lean();
    
    // Abstract the complex food object IDs just for contextual understanding
    const meals = recentNutrition?.meals?.map((m: any) => ({
        type: m.mealType,
        grams: m.amount,
        calories: m.macros?.calories || 0,
        protein: m.macros?.protein || 0,
        fats: m.macros?.fats || 0,
    })) || [];

    const recentWorkout = await WorkoutSession.findOne({ userId }).sort({ date: -1 }).lean();

    // Compute recent weight change (last 14 days vs 14 days before that)
    const now = new Date();
    const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14);
    const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(now.getDate() - 28);
    const recentWeightLogs = await WeightLog.find({ 
        userId, 
        date: { $gte: twoWeeksAgo.toISOString().split('T')[0] }
    }).sort({ date: 1 }).lean();
    const priorWeightLogs = await WeightLog.find({ 
        userId,
        date: { $gte: fourWeeksAgo.toISOString().split('T')[0], $lt: twoWeeksAgo.toISOString().split('T')[0] }
    }).sort({ date: 1 }).lean();

    let recentWeightChange: number | null = null;
    if (recentWeightLogs.length > 0 && priorWeightLogs.length > 0) {
        const recentAvg = recentWeightLogs.reduce((s, l) => s + l.weight, 0) / recentWeightLogs.length;
        const priorAvg = priorWeightLogs.reduce((s, l) => s + l.weight, 0) / priorWeightLogs.length;
        recentWeightChange = parseFloat((recentAvg - priorAvg).toFixed(2));
    }

    const dietModeExplanation: Record<string, string> = {
        bulk: 'Caloric surplus for maximum muscle gain',
        slight_bulk: 'Small caloric surplus for lean muscle gain',
        recomp: 'At maintenance — simultaneous fat loss and muscle gain',
        slight_cut: 'Small caloric deficit for gradual fat loss',
        cut: 'Caloric deficit for aggressive fat loss',
    };

    return {
        type: "health",
        biometrics,
        dietPlan: {
            mode: biometrics.dietMode,
            description: dietModeExplanation[biometrics.dietMode] || 'Custom plan',
            targetCalories: biometrics.targetCalories,
            maintenanceCalories: biometrics.maintenanceCalories,
            calorieOffset: biometrics.dietModeCalorieOffset,
        },
        calories: {
            today: calories,
            status: calorieStatus.status,
            variance: calorieStatus.difference
        },
        nutrition: {
            todayMeals: meals,
            weeklyAvg: nutritionAverages.weekly,
            monthlyAvg: nutritionAverages.monthly,
        },
        gym: {
            last7Days: gym.last7Days,
            last30Days: gym.last30Days,
            consistencyScore: gym.consistencyScore,
            latestWorkout: recentWorkout ? { 
                date: recentWorkout.date, 
                duration: `${recentWorkout.durationMinutes} min` 
            } : null
        },
        weight: {
            ...weight,
            recentChange: recentWeightChange !== null 
                ? `${recentWeightChange > 0 ? '+' : ''}${recentWeightChange} kg (last 2 weeks)`
                : 'Insufficient data',
        },
        summary: `Health context for intelligent fitness coaching. 
Diet mode: ${biometrics.dietMode.replace('_', ' ')} (${biometrics.dietModeCalorieOffset > 0 ? '+' : ''}${biometrics.dietModeCalorieOffset} kcal vs maintenance).
Maintenance Calories (calculated): ${biometrics.maintenanceCalories} kcal. Target Calories: ${biometrics.targetCalories} kcal.
Weekly avg calories: ${nutritionAverages.weekly.calories} kcal.
Weekly avg protein: ${nutritionAverages.weekly.protein}g. Weekly avg fats: ${nutritionAverages.weekly.fats}g.
Use this data to evaluate progress, give macro advice, and answer health/fitness questions.`,
    };
}
