import { FoodItem } from "@/server/db/models/FoodItem";
import { DayTemplate } from "@/server/db/models/DayTemplate";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { DailyLog } from "@/server/db/models/DailyLog";
import { User } from "@/server/db/models/User";
import { getActiveDate } from "@/server/automation/timeUtils";

// Parses free-text like "4 bananas and 2 eggs" into [{name, quantity}]
function parseIngredients(description: string): { name: string; quantity: number }[] {
    const pattern = /(\d+(?:\.\d+)?)\s+([a-zA-Z\s]+)/g;
    const results: { name: string; quantity: number }[] = [];
    let match;
    const text = description.toLowerCase();
    while ((match = pattern.exec(text)) !== null) {
        const quantity = parseFloat(match[1]);
        const name = match[2].trim().replace(/\s+and\s*$/, "").replace(/s$/, ""); // basic singular
        results.push({ name, quantity });
    }
    return results;
}

export async function handleLogMeal(payload: { description: string }, userId: string) {
    const user = await User.findById(userId).select("settings").lean();
    const today = getActiveDate(user?.settings?.timezone);

    const desc = payload.description?.toLowerCase() || "";

    // ─── Path 1: Template matching ───────────────────────────────────────
    // If description sounds like a template (no numbers) → try fuzzy template name match
    const templates = await DayTemplate.find({ userId }).populate("meals.foodItemId").lean();
    const matchedTemplate = templates.find(t =>
        desc.includes(t.name.toLowerCase()) ||
        t.name.toLowerCase().split(" ").every((word: string) => desc.includes(word))
    );

    if (matchedTemplate) {
        return await applyTemplate(matchedTemplate, userId, today);
    }

    // ─── Path 2: Ingredient parsing ──────────────────────────────────────
    const ingredients = parseIngredients(desc);

    // ─── Path 2.5: Fallback — whole-description food name match ─────────
    // Fires when description has no numbers (e.g. "log my ghee grilled chicken")
    // Strips filler words, fuzzy-matches the remainder against the food library.
    if (ingredients.length === 0) {
        const library = await FoodItem.find({ userId }).lean();

        // Remove common log-command filler words (including possessives like "today's")
        const fillerPattern = /\b(log|add|record|track|ate|had|eat|my|the|some|a|an|please|to|today|today's?|for|food|meal|snack|dinner|lunch|breakfast|into)\b|'s/gi;
        const cleaned = desc.replace(fillerPattern, " ").replace(/\s+/g, " ").trim();
        const cleanedWords = cleaned.split(" ").filter(w => w.length > 2);

        // Best-match: score each food item; highest overlap wins (avoids short names beating specific ones)
        let directMatch: (typeof library)[0] | undefined;
        let bestScore = 0;
        for (const f of library) {
            const fname = f.name.toLowerCase();
            if (fname.includes(cleaned) || cleaned.includes(fname)) {
                const score = 1000 + fname.length;
                if (score > bestScore) { bestScore = score; directMatch = f; }
                continue;
            }
            const fwords = fname.split(" ").filter((w: string) => w.length > 2);
            const matchCount = fwords.filter((w: string) => cleanedWords.includes(w)).length;
            const threshold = Math.min(2, fwords.length);
            if (matchCount >= threshold && matchCount > bestScore) {
                bestScore = matchCount;
                directMatch = f;
            }
        }

        if (!directMatch) {
            return {
                type: "log_meal",
                success: false,
                error: `Could not find "${cleaned}" in your food library. Make sure the name matches something you've saved, or provide a quantity (e.g. "1 ghee grilled chicken").`
            };
        }

        // Default: 1 serving = 1 baseWeight
        const macros = directMatch.macros;
        const mealEntry = {
            mealType: "snack" as const,
            foodItemId: directMatch._id,
            amount: directMatch.baseWeight,
            macros: {
                calories: Math.round(macros.calories),
                protein: parseFloat(macros.protein.toFixed(1)),
                carbs: parseFloat(macros.carbs.toFixed(1)),
                fats: parseFloat(macros.fats.toFixed(1)),
            }
        };

        const existing = await NutritionLog.findOne({ userId, date: today });
        const existingMeals = existing?.meals || [];
        const existingTotals = existing?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };
        const updatedTotals = {
            calories: Math.round((existingTotals.calories || 0) + macros.calories),
            protein: parseFloat(((existingTotals.protein || 0) + macros.protein).toFixed(1)),
            carbs: parseFloat(((existingTotals.carbs || 0) + macros.carbs).toFixed(1)),
            fats: parseFloat(((existingTotals.fats || 0) + macros.fats).toFixed(1)),
        };

        await NutritionLog.findOneAndUpdate(
            { userId, date: today },
            { meals: [...existingMeals, mealEntry], dailyTotals: updatedTotals },
            { upsert: true, new: true }
        );
        await DailyLog.findOneAndUpdate(
            { userId, date: today },
            { $set: { "physical.calories": updatedTotals.calories } },
            { upsert: true }
        );

        return {
            type: "log_meal",
            success: true,
            data: {
                itemsLogged: 1,
                notFound: [],
                totalCaloriesAdded: Math.round(macros.calories),
                newDayTotal: updatedTotals.calories,
                message: `Logged 1 serving of "${directMatch.name}" (${Math.round(macros.calories)} kcal, ${directMatch.baseWeight}g). New day total: ${updatedTotals.calories} kcal.`
            }
        };
    }

    const library = await FoodItem.find({ userId }).lean();
    const mealsToAdd: any[] = [];
    let totalCals = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
    const missed: string[] = [];

    for (const ing of ingredients) {
        // Fuzzy search: find best matching food in library
        const match = library.find(f =>
            f.name.toLowerCase().includes(ing.name) || ing.name.includes(f.name.toLowerCase())
        );

        if (!match) {
            missed.push(ing.name);
            continue;
        }

        // The food library stores macros for ONE unit (baseWeight).
        // "4 bananas" = 4 units, so total macros = quantity × stored macros.
        // The amount logged in grams = quantity × baseWeight (e.g., 4 × 120g = 480g)
        const multiplier = ing.quantity;
        const cals = match.macros.calories * multiplier;
        const protein = match.macros.protein * multiplier;
        const carbs = match.macros.carbs * multiplier;
        const fats = match.macros.fats * multiplier;

        mealsToAdd.push({
            mealType: "snack",
            foodItemId: match._id,
            amount: match.baseWeight * multiplier, // total grams (e.g., 4 bananas = 480g)
            macros: {
                calories: Math.round(cals),
                protein: parseFloat(protein.toFixed(1)),
                carbs: parseFloat(carbs.toFixed(1)),
                fats: parseFloat(fats.toFixed(1)),
            }
        });

        totalCals += cals;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFats += fats;
    }

    if (mealsToAdd.length === 0) {
        return {
            type: "log_meal",
            success: false,
            error: `None of the foods (${missed.join(", ")}) were found in your library. Please add them first.`
        };
    }

    // Upsert into NutritionLog — append to existing meals array
    const existing = await NutritionLog.findOne({ userId, date: today });
    const existingMeals = existing?.meals || [];
    const existingTotals = existing?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };

    const updatedTotals = {
        calories: Math.round((existingTotals.calories || 0) + totalCals),
        protein: parseFloat(((existingTotals.protein || 0) + totalProtein).toFixed(1)),
        carbs: parseFloat(((existingTotals.carbs || 0) + totalCarbs).toFixed(1)),
        fats: parseFloat(((existingTotals.fats || 0) + totalFats).toFixed(1)),
    };

    await NutritionLog.findOneAndUpdate(
        { userId, date: today },
        { meals: [...existingMeals, ...mealsToAdd], dailyTotals: updatedTotals },
        { upsert: true, new: true }
    );

    // Cross-sync to DailyLog
    await DailyLog.findOneAndUpdate(
        { userId, date: today },
        { $set: { "physical.calories": updatedTotals.calories } },
        { upsert: true }
    );

    return {
        type: "log_meal",
        success: true,
        data: {
            itemsLogged: mealsToAdd.length,
            notFound: missed,
            totalCaloriesAdded: Math.round(totalCals),
            newDayTotal: updatedTotals.calories,
            message: `Logged ${mealsToAdd.length} item(s) (${Math.round(totalCals)} kcal).${missed.length > 0 ? ` Could not find: ${missed.join(", ")}.` : ""}`
        }
    };
}

async function applyTemplate(template: any, userId: string, today: string) {
    const meals: any[] = [];
    let totalCals = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;

    for (const meal of template.meals) {
        const food = meal.foodItemId;
        if (!food) continue;

        const ratio = meal.customAmount / food.baseWeight;
        const cals = Math.round(food.macros.calories * ratio);
        const protein = parseFloat((food.macros.protein * ratio).toFixed(1));
        const carbs = parseFloat((food.macros.carbs * ratio).toFixed(1));
        const fats = parseFloat((food.macros.fats * ratio).toFixed(1));

        meals.push({
            mealType: meal.mealType,
            foodItemId: food._id,
            amount: meal.customAmount,
            macros: { calories: cals, protein, carbs, fats },
        });

        totalCals += cals;
        totalProtein += protein;
        totalCarbs += carbs;
        totalFats += fats;
    }

    // Append template meals on top of whatever is already logged today
    const existing = await NutritionLog.findOne({ userId, date: today });
    const existingMeals = existing?.meals || [];
    const existingTotals = existing?.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 };

    const updatedTotals = {
        calories: Math.round((existingTotals.calories || 0) + totalCals),
        protein: parseFloat(((existingTotals.protein || 0) + totalProtein).toFixed(1)),
        carbs: parseFloat(((existingTotals.carbs || 0) + totalCarbs).toFixed(1)),
        fats: parseFloat(((existingTotals.fats || 0) + totalFats).toFixed(1)),
    };

    await NutritionLog.findOneAndUpdate(
        { userId, date: today },
        { meals: [...existingMeals, ...meals], dailyTotals: updatedTotals },
        { upsert: true, new: true }
    );

    await DailyLog.findOneAndUpdate(
        { userId, date: today },
        { $set: { "physical.calories": updatedTotals.calories } },
        { upsert: true }
    );

    return {
        type: "log_meal",
        success: true,
        data: {
            templateApplied: template.name,
            itemsLogged: meals.length,
            templateCalories: Math.round(totalCals),
            newDayTotal: updatedTotals.calories,
            message: `Applied "${template.name}" template — added ${meals.length} meal(s) (${Math.round(totalCals)} kcal from template, ${updatedTotals.calories} kcal total for today).`
        }
    };
}
