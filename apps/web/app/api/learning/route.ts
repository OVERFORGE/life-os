import { getAuthSession } from "@/lib/auth";
import { LifeOSApplication } from "@life-os/execution-kernel";
import { apiSuccess, apiError } from "@/lib/apiResponse";

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const learningDTO = LifeOSApplication.learning.getLearning();
    return apiSuccess(learningDTO);
  } catch (err: any) {
    console.error("GET /api/learning Error:", err);
    return apiError(err.message || "Failed to fetch learning DTO", "INTERNAL_ERROR", 500);
  }
}
