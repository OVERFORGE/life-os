import { getTodayCalories, getGymStats, getWeightTrend, getCalorieStatus } from "./healthAggregations";
import { User } from "@/server/db/models/User";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { getActiveDate } from "@/server/automation/timeUtils";

export async function buildHealthContext(userId: string) {
    const user = await User.findById(userId).select("height heightUnit weight targetCalories maintenanceCalories settings").lean();
    
    const biometrics = {
        height: user?.height || null,
        heightUnit: user?.heightUnit || 'cm',
        weight: user?.weight || null,
        targetCalories: user?.targetCalories || 2000,
        maintenanceCalories: user?.maintenanceCalories || 2200
    };

    const calories = await getTodayCalories(userId);
    const calorieStatus = await getCalorieStatus(userId);
    const gym = await getGymStats(userId);
    const weight = await getWeightTrend(userId);

    const todayStr = getActiveDate(user?.settings?.timezone);
    
    const recentNutrition = await NutritionLog.findOne({ userId, date: todayStr }).lean();
    
    // Abstract the complex food object IDs just for contextual understanding
    const meals = recentNutrition?.meals?.map((m: any) => ({
        type: m.mealType,
        grams: m.amount,
        calories: m.macros?.calories || 0
    })) || [];

    const recentWorkout = await WorkoutSession.findOne({ userId }).sort({ date: -1 }).lean();

    return {
        type: "health",
        biometrics,
        calories: {
            today: calories,
            status: calorieStatus.status,
            variance: calorieStatus.difference
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
        weight,
        recentMeals: meals,
        summary: "Context Restricted entirely to Health Metrics. Answer all questions purely based on these biometrics."
    };
}
