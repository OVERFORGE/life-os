
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { uploadImageToCloudinary } from "@/server/utils/cloudinary";
import { analyzeFoodWithGemini } from "@/server/utils/gemini";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { base64Image, description } = await req.json();

    if (!base64Image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    // Run parallel: Uploading to Cloudinary & Sending to Gemini for analysis
    const [imageUrl, aiData] = await Promise.all([
      uploadImageToCloudinary(base64Image),
      analyzeFoodWithGemini(base64Image, description || ""),
    ]);

    return Response.json({
      success: true,
      imageUrl,
      ...aiData,
    });
  } catch (error: any) {
    console.error("AI Analyze Route Error:", error);
    return Response.json({ error: error.message || "Failed to analyze image" }, { status: 500 });
  }
}
