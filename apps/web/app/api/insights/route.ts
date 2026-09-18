import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { LifeOSApplication } from "@life-os/execution-kernel";
import { apiSuccess, apiError } from "@/lib/apiResponse";

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const userId = (session!.user as any).id;
    await connectDB();

    const insightsDTO = await LifeOSApplication.insights.getInsights(userId);
    return apiSuccess(insightsDTO);
  } catch (err: any) {
    console.error("GET /api/insights Error:", err);
    return apiError(err.message || "Failed to fetch insights DTO", "INTERNAL_ERROR", 500);
  }
}
