/**
 * route.ts - /api/surface/reversal
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Endpoint for reversing autonomous actions within the authoritative 24-hour retention window.
 * Enforces session authentication, tenant isolation, and kernel compensation execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiError } from "@/lib/apiResponse";
import {
  AutonomousActionReverser,
  KernelCapabilityService,
  ActionAdapterRegistry,
  registerDefaultActionAdapters,
} from "@life-os/execution-kernel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const userId = (session?.user as any)?.id;

    if (!userId) {
      return apiError("Unauthorized", "UNAUTHORIZED", 401);
    }

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const { executionId } = body;

    if (!executionId) {
      return apiError("Missing required executionId", "BAD_REQUEST", 400);
    }

    const reverser = AutonomousActionReverser.getInstance();
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
    const kernelCapabilityService = KernelCapabilityService.getInstance();

    const result = await reverser.executeCompensation(
      userId,
      executionId,
      kernelCapabilityService
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Compensation failed", lifecycleState: result.lifecycleState },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      executionId,
      lifecycleState: result.lifecycleState,
      compensatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("POST /api/surface/reversal Error:", err);
    return apiError(err.message || "Failed to execute reversal", "INTERNAL_ERROR", 500);
  }
}

