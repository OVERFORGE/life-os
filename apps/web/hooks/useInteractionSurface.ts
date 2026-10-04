"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type {
  IInteractionSurfaceProjection,
  ISurfaceActionEnvelope,
  IKernelExecutionResult,
  SurfaceActionType,
} from "@life-os/execution-kernel";
import { useSession } from "next-auth/react";

function computeClientActionIdempotencyKey(
  userId: string,
  actionType: SurfaceActionType,
  entityId: string,
  seed: string
): string {
  const raw = `${userId}:${actionType}:${entityId}:${seed}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `idemp_web_${Math.abs(hash).toString(16)}_${Date.now().toString(36)}`;
}

interface SessionUserWithId {
  id?: string;
  name?: string | null;
  email?: string | null;
}

export type SurfaceSyncStatus = "IDLE" | "SYNCING" | "RECONCILING" | "OFFLINE";

export function useInteractionSurface() {
  const { data: session } = useSession();
  const user = session?.user as SessionUserWithId | undefined;
  const userId = user?.id || "usr_web_client";

  const [projection, setProjection] = useState<IInteractionSurfaceProjection | null>(null);
  const [syncStatus, setSyncStatus] = useState<SurfaceSyncStatus>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Sync state to native Desktop System Tray if running under Tauri
  useEffect(() => {
    if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
      try {
        const invoke = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<void> } } }).__TAURI__?.core?.invoke;
        if (invoke) {
          if (projection?.activeExecution) {
            const exec = projection.activeExecution;
            const remainingMins = Math.max(0, Math.ceil(exec.remainingSeconds / 60));
            invoke("update_tray_status", {
              title: exec.title,
              tooltip: `LifeOS — Active: ${exec.title} (${remainingMins}m left)`
            }).catch(() => {});
          } else {
            invoke("update_tray_status", {
              title: "LifeOS",
              tooltip: "LifeOS: Calm"
            }).catch(() => {});
          }
        }
      } catch {
        // Native Tauri bridge not available in browser runtime
      }
    }
  }, [projection]);

  // 1. Initial State Hydration
  const hydrate = useCallback(async () => {
    try {
      setSyncStatus("SYNCING");
      const res = await fetch("/api/surface/state");
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setProjection(json.data);
        }
      }
      setSyncStatus("IDLE");
    } catch (err) {
      console.warn("[useInteractionSurface] Hydration failed:", err);
      setSyncStatus("OFFLINE");
    }
  }, []);

  // 2. Connect to SSE Stream for live cross-device updates
  useEffect(() => {
    hydrate();

    const es = new EventSource("/api/surface/events");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.projection) {
          setProjection(payload.projection);
        }
      } catch {
        // Ignore ping comments
      }
    };

    es.onerror = () => {
      setSyncStatus("OFFLINE");
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [hydrate]);

  // 3. Dispatch Action through Sovereign Kernel Gateway
  const dispatchAction = useCallback(
    async <T extends SurfaceActionType>(
      actionType: T,
      entityId: string,
      payload: ISurfaceActionEnvelope<T>["payload"]
    ): Promise<IKernelExecutionResult | null> => {
      if (!projection) return null;

      setSyncStatus("SYNCING");
      setErrorMessage(null);

      const seed =
        projection.activeExecution?.idempotencySeed ||
        entityId ||
        `seed_${Date.now()}`;

      const idempotencyKey = computeClientActionIdempotencyKey(
        userId,
        actionType,
        entityId,
        seed
      );

      const envelope: ISurfaceActionEnvelope<T> = {
        sourceSurface: "WEB_STICKY_BAR",
        actionType,
        entityId,
        timestampMs: Date.now(),
        idempotencyKey,
        observedProjectionVersion: projection.projectionVersion,
        payload,
        clientSessionToken: "web_session",
      };

      try {
        const res = await fetch("/api/kernel/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
        });

        if (res.ok) {
          const json = await res.json();
          const result: IKernelExecutionResult = json?.data;

          if (result?.reprojection) {
            setProjection(result.reprojection);
          }

          if (result?.outcome === "RECONCILIATION_REQUIRED") {
            setSyncStatus("RECONCILING");
            setErrorMessage(result.errorMessage || "Reconciliation required");
          } else {
            setSyncStatus("IDLE");
          }

          return result;
        } else {
          setSyncStatus("OFFLINE");
          setErrorMessage(`Dispatch failed with HTTP ${res.status}`);
          return null;
        }
      } catch (err: unknown) {
        console.error("[useInteractionSurface] Dispatch network error:", err);
        setSyncStatus("OFFLINE");
        const message = err instanceof Error ? err.message : "Network offline";
        setErrorMessage(message);
        return null;
      }
    },
    [projection, userId]
  );

  return {
    projection,
    syncStatus,
    errorMessage,
    refresh: hydrate,
    dispatchAction,
    startExecution: (entityId: string, plannedDurationMinutes?: number) =>
      dispatchAction("start_execution", entityId, {
        startedAtMs: Date.now(),
        plannedDurationMinutes,
      }),
    completeTask: (entityId: string, completionNote?: string) =>
      dispatchAction("complete_task", entityId, {
        completedAtMs: Date.now(),
        completionNote,
      }),
    deferExecution: (entityId: string, deferMinutes: number = 15) =>
      dispatchAction("defer_execution", entityId, {
        deferMinutes,
        reason: `Deferred ${deferMinutes}m from web bar`,
      }),
    pauseExecution: (entityId: string) =>
      dispatchAction("pause_execution", entityId, {
        pausedAtMs: Date.now(),
      }),
    resumeExecution: (entityId: string) =>
      dispatchAction("resume_execution", entityId, {
        resumedAtMs: Date.now(),
      }),
    cancelExecution: (entityId: string, reason?: string) =>
      dispatchAction("cancel_execution", entityId, {
        cancelledAtMs: Date.now(),
        reason,
      }),
    compensateLastAction: (undoToken: string) =>
      dispatchAction("compensate_last_action", undoToken, {
        undoToken,
        compensatedAtMs: Date.now(),
      }),
  };
}
