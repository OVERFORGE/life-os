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

    const worldDTO = await LifeOSApplication.world.getWorld(userId);
    return apiSuccess(worldDTO);
  } catch (err: any) {
    console.error("GET /api/world Error:", err);
    return apiError(err.message || "Failed to fetch world DTO", "INTERNAL_ERROR", 500);
  }
}
