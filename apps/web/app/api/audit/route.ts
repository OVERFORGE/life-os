import { getAuthSession } from "@/lib/auth";
import { LifeOSApplication } from "@life-os/execution-kernel";
import { apiSuccess, apiError } from "@/lib/apiResponse";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!(session?.user as any)?.id) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { topic, targetId, contextData = {} } = await req.json();

    if (!topic || typeof topic !== "string") {
      return apiError("Valid topic string is required for decision audit", "BAD_REQUEST", 400);
    }

    const auditDTO = LifeOSApplication.audit.getAuditReport({
      topic: topic as any,
      targetId,
      contextData,
    });

    return apiSuccess(auditDTO);
  } catch (err: any) {
    console.error("POST /api/audit Error:", err);
    return apiError(err.message || "Failed to generate decision audit DTO", "INTERNAL_ERROR", 500);
  }
}
