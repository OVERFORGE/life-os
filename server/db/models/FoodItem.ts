import { Schema, model, models } from "mongoose";

const FoodItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    description: { type: String }, // e.g., recipe details "100g oats, 1 banana"
    baseWeight: { type: Number, required: true }, // in grams, e.g., 500
    
    // Extracted components by AI or user
    components: [
      {
        name: String,
        amount: Number, // in grams
      }
    ],

    // Total macros for the `baseWeight`
    macros: {
      calories: { type: Number, required: true, default: 0 },
      protein: { type: Number, required: true, default: 0 },
      carbs: { type: Number, required: true, default: 0 },
      fats: { type: Number, required: true, default: 0 },
    },

    // Total micros for the `baseWeight`
    micros: {
      zinc: { type: Number, default: 0 },
      magnesium: { type: Number, default: 0 },
      vitaminC: { type: Number, default: 0 },
      vitaminB: { type: Number, default: 0 },
      iron: { type: Number, default: 0 },
      calcium: { type: Number, default: 0 },
    },

    imageUrl: { type: String }, // Reference to Cloudinary
  },
  { timestamps: true }
);

export const FoodItem = models.FoodItem || model("FoodItem", FoodItemSchema);
