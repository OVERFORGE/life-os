import { getAuthSession } from "@/lib/auth";
import { LifeOSApplication } from "@life-os/execution-kernel";
import { apiSuccess, apiError } from "@/lib/apiResponse";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("requestId") || "api_diagnostics_query";

    const diagnosticsDTO = LifeOSApplication.diagnostics.getDiagnostics(requestId);
    return apiSuccess(diagnosticsDTO);
  } catch (err: any) {
    console.error("GET /api/diagnostics Error:", err);
    return apiError(err.message || "Failed to fetch diagnostics DTO", "INTERNAL_ERROR", 500);
  }
}
