import { groqChat, cleanLLMResponse } from "../shared/groq";

export interface EstimatedNutrientItem {
  name: string;
  quantity?: number;
  amount?: number; // grams
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface MealEstimateResult {
  description: string;
  items: EstimatedNutrientItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  source: "groq_nutrition_ai" | "heuristic_fallback";
}

const HEURISTIC_DATABASE: Record<string, { cals: number; p: number; c: number; f: number }> = {
  egg: { cals: 72, p: 6.3, c: 0.4, f: 4.8 },
  eggs: { cals: 72, p: 6.3, c: 0.4, f: 4.8 },
  toast: { cals: 79, p: 2.7, c: 14.5, f: 1.0 },
  bread: { cals: 79, p: 2.7, c: 14.5, f: 1.0 },
  chicken: { cals: 165, p: 31.0, c: 0.0, f: 3.6 },
  rice: { cals: 130, p: 2.7, c: 28.0, f: 0.3 },
  broccoli: { cals: 35, p: 2.4, c: 7.0, f: 0.4 },
  oatmeal: { cals: 150, p: 5.0, c: 27.0, f: 2.5 },
  banana: { cals: 105, p: 1.3, c: 27.0, f: 0.3 },
  smoothie: { cals: 240, p: 20.0, c: 30.0, f: 3.5 },
  shake: { cals: 220, p: 25.0, c: 15.0, f: 3.0 },
  protein: { cals: 120, p: 24.0, c: 2.0, f: 1.5 },
  apple: { cals: 95, p: 0.5, c: 25.0, f: 0.3 },
  salmon: { cals: 208, p: 20.0, c: 0.0, f: 13.0 },
  steak: { cals: 270, p: 26.0, c: 0.0, f: 18.0 },
  salad: { cals: 120, p: 3.0, c: 10.0, f: 7.0 },
  avocado: { cals: 160, p: 2.0, c: 8.5, f: 14.7 },
  yogurt: { cals: 100, p: 10.0, c: 6.0, f: 2.0 },
  pasta: { cals: 220, p: 8.0, c: 43.0, f: 1.3 },
  pizza: { cals: 285, p: 12.0, c: 36.0, f: 10.0 },
  burger: { cals: 450, p: 25.0, c: 40.0, f: 20.0 },
};

export class NutritionEstimator {
  private static instance: NutritionEstimator;

  static getInstance(): NutritionEstimator {
    if (!NutritionEstimator.instance) {
      NutritionEstimator.instance = new NutritionEstimator();
    }
    return NutritionEstimator.instance;
  }

  async estimateMeal(description: string): Promise<MealEstimateResult> {
    const trimmed = (description || "").trim();
    if (!trimmed) {
      return {
        description: "Empty Meal",
        items: [],
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFats: 0,
        source: "heuristic_fallback",
      };
    }

    // Try Groq LLM Nutrition Estimation if API key available
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev") {
      try {
        const prompt = `You are a strict clinical nutrition estimator. Decompose the following meal description into individual food items with estimated calories and macronutrients (grams of protein, carbs, and fats).
Return ONLY a valid JSON object matching this exact schema:
{
  "items": [
    {
      "name": "Food item name",
      "quantity": 1,
      "calories": 150,
      "protein": 10,
      "carbs": 20,
      "fats": 3
    }
  ]
}

Meal description: "${trimmed}"`;

        const raw = await groqChat({
          messages: [
            { role: "system", content: "You output only valid JSON without explanation or formatting." },
            { role: "user", content: prompt },
          ],
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          temperature: 0.1,
          max_tokens: 400,
        });

        const cleaned = cleanLLMResponse(raw);
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            const items: EstimatedNutrientItem[] = parsed.items.map((it: any) => ({
              name: String(it.name || "Food Item"),
              quantity: typeof it.quantity === "number" ? it.quantity : 1,
              calories: Math.round(Number(it.calories) || 100),
              protein: parseFloat(Number(it.protein || 0).toFixed(1)),
              carbs: parseFloat(Number(it.carbs || 0).toFixed(1)),
              fats: parseFloat(Number(it.fats || 0).toFixed(1)),
            }));

            const totalCalories = items.reduce((acc, it) => acc + it.calories, 0);
            const totalProtein = parseFloat(items.reduce((acc, it) => acc + it.protein, 0).toFixed(1));
            const totalCarbs = parseFloat(items.reduce((acc, it) => acc + it.carbs, 0).toFixed(1));
            const totalFats = parseFloat(items.reduce((acc, it) => acc + it.fats, 0).toFixed(1));

            return {
              description: trimmed,
              items,
              totalCalories,
              totalProtein,
              totalCarbs,
              totalFats,
              source: "groq_nutrition_ai",
            };
          }
        }
      } catch (err) {
        console.warn("[NUTRITION_ESTIMATOR] Groq estimation failed, falling back to heuristic DB:", err);
      }
    }

    // Heuristic Fallback
    return this.heuristicEstimate(trimmed);
  }

  private heuristicEstimate(description: string): MealEstimateResult {
    const lower = description.toLowerCase();
    const items: EstimatedNutrientItem[] = [];

    // Split on "and", ",", "&", "with"
    const rawTokens = lower.split(/,|\band\b|&|\bwith\b|\+/i).map((t) => t.trim()).filter(Boolean);

    for (const token of rawTokens) {
      // Check quantity: e.g. "two eggs" or "2 eggs"
      let quantity = 1;
      const numMatch = token.match(/\b(\d+)\b/) || token.match(/\b(one|two|three|four|five)\b/);
      if (numMatch) {
        const val = numMatch[1];
        if (/^\d+$/.test(val)) quantity = parseInt(val, 10);
        else if (val === "one") quantity = 1;
        else if (val === "two") quantity = 2;
        else if (val === "three") quantity = 3;
        else if (val === "four") quantity = 4;
        else if (val === "five") quantity = 5;
      }

      let matchedMacro = { cals: 150, p: 5, c: 20, f: 5 };
      let itemName = token.replace(/^\d+\s*/, "").replace(/^(one|two|three|four|five)\s*/, "").trim();

      for (const [key, macro] of Object.entries(HEURISTIC_DATABASE)) {
        if (token.includes(key)) {
          matchedMacro = macro;
          itemName = key;
          break;
        }
      }

      items.push({
        name: itemName || "Food item",
        quantity,
        calories: matchedMacro.cals * quantity,
        protein: parseFloat((matchedMacro.p * quantity).toFixed(1)),
        carbs: parseFloat((matchedMacro.c * quantity).toFixed(1)),
        fats: parseFloat((matchedMacro.f * quantity).toFixed(1)),
      });
    }

    if (items.length === 0) {
      items.push({
        name: description,
        quantity: 1,
        calories: 250,
        protein: 10,
        carbs: 30,
        fats: 8,
      });
    }

    const totalCalories = items.reduce((acc, it) => acc + it.calories, 0);
    const totalProtein = parseFloat(items.reduce((acc, it) => acc + it.protein, 0).toFixed(1));
    const totalCarbs = parseFloat(items.reduce((acc, it) => acc + it.carbs, 0).toFixed(1));
    const totalFats = parseFloat(items.reduce((acc, it) => acc + it.fats, 0).toFixed(1));

    return {
      description,
      items,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFats,
      source: "heuristic_fallback",
    };
  }
}
