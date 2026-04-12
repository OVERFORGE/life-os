import { Schema, model, models } from "mongoose";

const DayTemplateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // e.g. "Rest Day", "Bulk Day 1"
    
    meals: [
      {
        mealType: { 
          type: String, 
          enum: ["breakfast", "lunch", "dinner", "snack"],
          required: true 
        },
        foodItemId: { type: Schema.Types.ObjectId, ref: "FoodItem", required: true },
        customAmount: { type: Number, required: true }, // Override the baseWeight with custom grams
      }
    ]
  },
  { timestamps: true }
);

export const DayTemplate = models.DayTemplate || model("DayTemplate", DayTemplateSchema);
