import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import { KernelCapabilityService, ActionProposal } from "@life-os/execution-kernel";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    let userId = (session?.user as any)?.id;

    await connectDB();

    if (!userId && process.env.NODE_ENV !== "production") {
      const { User } = await import("@/server/db/models/User");
      const firstUser = await User.findOne().lean();
      if (firstUser) {
        userId = (firstUser as any)._id.toString();
      }
    }

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }
    const body = await req.json();

    if (!body?.actionType || !body?.payload) {
      return apiError("actionType and payload are required", "VALIDATION_ERROR", 400);
    }

    await connectDB();

    const propId = `prop_cal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = body.idempotencyKey || `idemp_cal_${propId}`;

    const proposal: ActionProposal = {
      id: propId,
      domain: "productivity",
      actionType: body.actionType,
      payload: body.payload,
      rationale: body.rationale || "Calendar UI user interaction",
      reversibility: "atomic_single_doc",
      idempotencyKey,
    };

    const kernel = KernelCapabilityService.getInstance();
    const result = await kernel.executeAction(userId, proposal);

    if (!result.success) {
      return apiError(result.error || "Kernel action execution failed", "KERNEL_EXECUTION_FAILED", 422);
    }

    return apiSuccess(result);
  } catch (err: any) {
    console.error("POST /api/calendar/mutate Error:", err);
    return apiError(err.message || "Failed to execute calendar mutation", "INTERNAL_ERROR", 500);
  }
}
