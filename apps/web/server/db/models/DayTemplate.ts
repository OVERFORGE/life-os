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
    ],
    deletedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
    mutationEpoch: { type: Number, default: 0 },
    recentMutationReceipts: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const DayTemplate = models.DayTemplate || model("DayTemplate", DayTemplateSchema);
