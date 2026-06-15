import { Schema, model, models } from "mongoose";

const NutritionLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    
    meals: [
      {
        mealType: { 
          type: String, 
          enum: ["breakfast", "lunch", "dinner", "snack"],
          required: true 
        },
        foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true },
        amount: { type: Number, required: true }, // The actual gram weight consumed
        
        // Storing the calculated macros/micros AT the time of eating, 
        // in case the base FoodItem changes in the library later
        macros: {
          calories: Number,
          protein: Number,
          carbs: Number,
          fats: Number,
        },
        micros: {
          zinc: Number,
          magnesium: Number,
          vitaminC: Number,
          vitaminB: Number,
          iron: Number,
          calcium: Number,
        }
      }
    ],

    dailyTotals: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
    }
  },
  { timestamps: true }
);

// Ensure only one log per day per user
NutritionLogSchema.index({ userId: 1, date: 1 }, { unique: true });

export const NutritionLog = models.NutritionLog || model("NutritionLog", NutritionLogSchema);
