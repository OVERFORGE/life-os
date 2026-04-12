import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const NUTRITION_SYSTEM_PROMPT = `
You are an expert nutritionist AI. Your task is to analyze the provided image of food, taking the user's description into account.
Estimate the portion sizes, individual components, and generate an accurate macro/micro nutrient profile.

Return ONLY a valid JSON object matching exactly this schema:
{
  "name": "Generically descriptive name of the dish",
  "baseWeight": 0,
  "components": [
    { "name": "Ingredient 1", "amount": 0 }
  ],
  "macros": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fats": 0
  },
  "micros": {
    "zinc": 0,
    "magnesium": 0,
    "vitaminC": 0,
    "vitaminB": 0,
    "iron": 0,
    "calcium": 0
  }
}

Definitions:
- baseWeight: The total estimated weight of all food in grams.
- components[amount]: Component amounts must be in grams.
- macros: protein, carbs, and fats must be in grams. calories is kcals.
- micros: ALL micro nutrients must be returned in mg (milligrams).

If there are items you are unsure about, make a highly educated estimate based on standard USDA nutritional facts. Your output MUST be strictly valid JSON and nothing else.
`;

export const analyzeFoodWithGemini = async (base64Image: string, userDescription: string) => {
  try {
    // Determine the mime type from the data URI (or default to jpeg)
    let mimeType = "image/jpeg";
    let base64Data = base64Image;

    if (base64Image.startsWith("data:image")) {
      const parts = base64Image.split(";base64,");
      mimeType = parts[0].split(":")[1];
      base64Data = parts[1];
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: NUTRITION_SYSTEM_PROMPT },
            { text: `User custom description/ingredients context: "${userDescription || 'None'}"` },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini");
    }

    let cleanText = responseText;
    if (typeof cleanText === "string") {
      cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze food with Gemini AI");
  }
};
