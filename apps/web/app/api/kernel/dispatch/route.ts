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
  createTraceContext,
  runWithTraceContext,
  recordTraceStep,
  startDirectLangSmithRun,
  TracePersistenceService,
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

    const envelope = (await req.json()) as ISurfaceActionEnvelope;

    if (!envelope || !envelope.actionType || !envelope.idempotencyKey) {
      return apiError(
        "Invalid action envelope: actionType and idempotencyKey are required",
        "VALIDATION_ERROR",
        400
      );
    }

    if ((envelope as any).userId && String((envelope as any).userId) !== String(userId)) {
      return apiError("Forbidden: Caller userId does not match authenticated session", "FORBIDDEN", 403);
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

    const requestId = req.headers.get("x-request-id") || `req_kd_${Date.now()}`;
    const executionId = `exec_kd_${proposal.id}`;
    const lsRun = await startDirectLangSmithRun({
      name: `kernel_dispatch:${envelope.actionType}`,
      runType: "chain",
      inputs: { actionType: envelope.actionType, entityId: envelope.entityId },
      metadata: { userId, requestId, executionId },
      tags: ["lifeos:kernel_dispatch"],
    });
    const traceCtx = createTraceContext({
      requestId,
      executionId,
      userId: String(userId),
      surface: "kernel_dispatch",
      langsmithRunId: lsRun.runId,
      langsmithUrl: lsRun.url,
    });

    return await runWithTraceContext(traceCtx, async () => {
      // 4. Sovereign Kernel Dispatch
      const kernelStart = Date.now();
      const kernelResult = await kernel.executeAction(userId, proposal);
      recordTraceStep({
        layer: "kernel",
        component: "KernelCapabilityService",
        operation: envelope.actionType,
        status: kernelResult.success ? "COMPLETED" : "FAILED",
        startedAtMs: kernelStart,
        durationMs: Date.now() - kernelStart,
        inputs: { actionType: envelope.actionType, idempotencyKey: envelope.idempotencyKey },
        outputs: { actionId: kernelResult.actionId, status: kernelResult.status, success: kernelResult.success },
        error: kernelResult.error,
      });

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
        await lsRun.finish(responsePayload, kernelResult.error);
        void TracePersistenceService.getInstance().persistTrace({
          ctx: traceCtx,
          status: "FAILED",
          terminationReason: failureOutcome,
          finalFrontendPayload: responsePayload,
        });
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

      await lsRun.finish(successResult);
      void TracePersistenceService.getInstance().persistTrace({
        ctx: traceCtx,
        status: "COMPLETED",
        terminationReason: outcome,
        finalFrontendPayload: { outcome, actionId: kernelResult.actionId, idempotent: kernelResult.idempotent },
      });

      return apiSuccess(successResult);
    });
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
  const rawEntityId = envelope.entityId || "";
  const cleanTaskId = rawEntityId.startsWith("task_occ_")
    ? rawEntityId.replace("task_occ_", "")
    : rawEntityId.startsWith("occ_")
    ? rawEntityId.replace("occ_", "")
    : rawEntityId;

  switch (actionType) {
    case "start_execution": {
      const payload = envelope.payload as any;
      return {
        id: propId,
        domain: "productivity",
        actionType: "start_execution",
        targetEntityId: rawEntityId,
        payload: {
          occurrenceId: rawEntityId,
          taskId: cleanTaskId,
          startedAtMs: payload.startedAtMs || Date.now(),
          plannedDurationMinutes: payload.plannedDurationMinutes || 30,
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
        targetEntityId: rawEntityId,
        payload: {
          taskId: cleanTaskId,
          occurrenceId: rawEntityId,
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
        actionType: "defer_execution",
        targetEntityId: rawEntityId,
        payload: {
          occurrenceId: rawEntityId,
          taskId: cleanTaskId,
          deferMinutes: shiftMinutes,
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
        actionType: "pause_execution",
        targetEntityId: rawEntityId,
        payload: {
          occurrenceId: rawEntityId,
          taskId: cleanTaskId,
          pausedAtMs: payload.pausedAtMs || Date.now(),
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
