import { NextRequest } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { connectDB } from "@/server/db/connect";
import { apiSuccess, apiError } from "@/lib/apiResponse";
import {
  KernelCapabilityService,
  ActionProposal,
  InteractionSurfaceService,
  ISurfaceActionEnvelope,
  IKernelExecutionResult,
  KernelExecutionOutcome,
  SurfaceActionType,
} from "@life-os/execution-kernel";

export const dynamic = "force-dynamic";

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

    const envelope = (await req.json()) as ISurfaceActionEnvelope;

    if (!envelope || !envelope.actionType || !envelope.idempotencyKey) {
      return apiError(
        "Invalid action envelope: actionType and idempotencyKey are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const kernel = KernelCapabilityService.getInstance();
    const surfaceService = InteractionSurfaceService.getInstance();

    const timezoneHint = req.headers.get("x-timezone") || undefined;
    const { fetchAuthoritativeSurfaceProjection } = await import(
      "@/server/services/surfaceProjection.service"
    );

    // 1. Idempotency Ingress Gate (Check before executing)
    const existingAudit = kernel.getAuditRecord(envelope.idempotencyKey);
    if (existingAudit && existingAudit.status === "SUCCEEDED") {
      const reprojection = await fetchAuthoritativeSurfaceProjection(userId, timezoneHint);
      const idempotentResult: IKernelExecutionResult = {
        outcome: "REJECTED_IDEMPOTENT_DUPLICATE",
        actionId: existingAudit.actionId,
        idempotencyKey: envelope.idempotencyKey,
        committedAtMs: existingAudit.timestamp,
        reprojection,
      };
      return apiSuccess(idempotentResult);
    }

    // 2. Handle Compensate Last Action
    if (envelope.actionType === "compensate_last_action") {
      const undoToken = (envelope.payload as any)?.undoToken || envelope.entityId;
      const compensated = await kernel.compensateAction(
        { idempotencyKey: undoToken, operationId: undoToken },
        userId
      );
      const reprojection = await fetchAuthoritativeSurfaceProjection(userId, timezoneHint);
      const result: IKernelExecutionResult = {
        outcome: compensated ? "COMPENSATED" : "RECONCILIATION_REQUIRED",
        actionId: `act_comp_${Date.now()}`,
        idempotencyKey: envelope.idempotencyKey,
        committedAtMs: Date.now(),
        reprojection,
      };
      return apiSuccess(result);
    }

    // 3. Map Surface Action Envelope to Canonical ActionProposal
    const proposal = translateEnvelopeToProposal(userId, envelope);

    // 4. Sovereign Kernel Dispatch
    const kernelResult = await kernel.executeAction(userId, proposal);

    // 5. Compute fresh authoritative reprojection
    const reprojection = await fetchAuthoritativeSurfaceProjection(userId, timezoneHint);

    if (!kernelResult.success) {
      const failureOutcome: KernelExecutionOutcome =
        kernelResult.status === "NEEDS_CLARIFICATION"
          ? "CONFIRMATION_REQUIRED"
          : "RECONCILIATION_REQUIRED";

      const responsePayload: IKernelExecutionResult = {
        outcome: failureOutcome,
        actionId: kernelResult.actionId,
        idempotencyKey: envelope.idempotencyKey,
        errorMessage: kernelResult.error || "Execution failed",
        reprojection,
      };
      return apiSuccess(responsePayload);
    }

    // 6. Map Successful Outcome
    const outcome: KernelExecutionOutcome =
      proposal.reversibility === "atomic_single_doc" || proposal.reversibility === "reversible_with_compensation"
        ? "EXECUTE_WITH_UNDO"
        : "EXECUTE_COMMITTED";

    const successResult: IKernelExecutionResult = {
      outcome: kernelResult.idempotent ? "REJECTED_IDEMPOTENT_DUPLICATE" : outcome,
      actionId: kernelResult.actionId,
      idempotencyKey: envelope.idempotencyKey,
      committedAtMs: Date.now(),
      undoToken: outcome === "EXECUTE_WITH_UNDO" ? `undo_${kernelResult.actionId}` : undefined,
      reprojection,
    };

    return apiSuccess(successResult);
  } catch (err: any) {
    console.error("POST /api/kernel/dispatch Error:", err);
    return apiError(err.message || "Failed to dispatch kernel action", "INTERNAL_ERROR", 500);
  }
}

/**
 * Translates an incoming surface action envelope into a canonical ActionProposal.
 * Adheres strictly to the sovereign kernel domain capability vocabulary.
 */
function translateEnvelopeToProposal(
  userId: string,
  envelope: ISurfaceActionEnvelope
): ActionProposal {
  const propId = `prop_surface_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const actionType = envelope.actionType as SurfaceActionType;

  switch (actionType) {
    case "start_execution": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "log_execution_interval",
        targetEntityId: envelope.entityId,
        payload: {
          occurrenceId: envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          taskId: !envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          startedAtMs: payload.startedAtMs || Date.now(),
          endedAtMs: 0,
          durationMinutes: payload.plannedDurationMinutes || 30,
          source: mapSurfaceToSource(envelope.sourceSurface),
        },
        rationale: `Headless start from ${envelope.sourceSurface}`,
        reversibility: "atomic_single_doc",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    case "complete_task": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "complete_task",
        targetEntityId: envelope.entityId,
        payload: {
          taskId: envelope.entityId,
          completedAtMs: payload.completedAtMs || Date.now(),
          completionNote: payload.completionNote,
        },
        rationale: `Headless complete from ${envelope.sourceSurface}`,
        reversibility: "atomic_single_doc",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    case "defer_execution": {
      const payload = envelope.payload as any;
      const shiftMinutes = payload.deferMinutes || 15;
      return {
        id: propId,
        domain: "productivity",
        actionType: "reschedule_occurrence",
        targetEntityId: envelope.entityId,
        payload: {
          occurrenceId: envelope.entityId,
          shiftMinutes,
          reason: payload.reason || "Postponed via ambient surface",
        },
        rationale: `Headless defer (+${shiftMinutes}m) from ${envelope.sourceSurface}`,
        reversibility: "reversible_with_compensation",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    case "pause_execution": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "log_execution_interval",
        targetEntityId: envelope.entityId,
        payload: {
          occurrenceId: envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          taskId: !envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          startedAtMs: Date.now() - 60000,
          endedAtMs: payload.pausedAtMs || Date.now(),
          durationMinutes: 1,
          source: mapSurfaceToSource(envelope.sourceSurface),
          notes: "Paused from surface",
        },
        rationale: `Headless pause from ${envelope.sourceSurface}`,
        reversibility: "atomic_single_doc",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    case "resume_execution": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "log_execution_interval",
        targetEntityId: envelope.entityId,
        payload: {
          occurrenceId: envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          taskId: !envelope.entityId.startsWith("occ_") ? envelope.entityId : undefined,
          startedAtMs: payload.resumedAtMs || Date.now(),
          endedAtMs: 0,
          durationMinutes: 30,
          source: mapSurfaceToSource(envelope.sourceSurface),
          notes: "Resumed from surface",
        },
        rationale: `Headless resume from ${envelope.sourceSurface}`,
        reversibility: "atomic_single_doc",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    case "cancel_execution": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "cancel_occurrence",
        targetEntityId: envelope.entityId,
        payload: {
          occurrenceId: envelope.entityId,
          reason: payload.reason || "Cancelled via ambient surface",
        },
        rationale: `Headless cancel from ${envelope.sourceSurface}`,
        reversibility: "reversible_with_compensation",
        idempotencyKey: envelope.idempotencyKey,
      };
    }

    default: {
      throw new Error(`Unsupported surface action type: ${actionType}`);
    }
  }
}

function mapSurfaceToSource(source: string): "aven_voice" | "web_manual" | "mobile_touch" | "desktop_heartbeat" {
  if (source.startsWith("ANDROID") || source.startsWith("IOS")) {
    return "mobile_touch";
  }
  if (source.startsWith("DESKTOP")) {
    return "desktop_heartbeat";
  }
  if (source === "WAKE_WORD_AVEN") {
    return "aven_voice";
  }
  return "web_manual";
}
