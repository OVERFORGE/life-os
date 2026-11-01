/**
 * useLifeOSReactiveStream.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * React hook connecting UI components to reactive stream invalidations,
 * multi-tab Web Locks leader election, and selective SWR cache rehydration.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  TabSyncCoordinator,
  TabRole,
} from "../services/TabSyncCoordinator";

export type SWRMutateFn = (
  filter: (key: any) => boolean,
  data?: any,
  opts?: { revalidate?: boolean }
) => Promise<any> | void;

// Safe SWR revalidation caller (falls back to global/custom mutate or CustomEvent)
function invokeSafeMutate(
  filter: (key: any) => boolean,
  customMutate?: SWRMutateFn
): void {
  if (customMutate) {
    customMutate(filter, undefined, { revalidate: true });
    return;
  }
  if (typeof window !== "undefined") {
    const win = window as any;
    if (typeof win.__swrMutate === "function") {
      win.__swrMutate(filter, undefined, { revalidate: true });
    }
  }
}

export interface ReactiveStreamState {
  role: TabRole;
  isConnected: boolean;
  isDegraded: boolean;
  lastDeliverySeq: number;
  lastInvalidationAt: Date | null;
}

export function useLifeOSReactiveStream(options?: {
  endpoint?: string;
  onInvalidateTags?: (tags: string[]) => void;
  onProjectionSync?: (projection: any) => void;
  customMutate?: SWRMutateFn;
}) {
  const endpoint = options?.endpoint || "/api/surface/events";
  const [state, setState] = useState<ReactiveStreamState>({
    role: "FOLLOWER",
    isConnected: false,
    isDegraded: false,
    lastDeliverySeq: 0,
    lastInvalidationAt: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const coordinatorRef = useRef<TabSyncCoordinator | null>(null);

  const handleInvalidation = useCallback(
    (tags: string[], deliverySeq: number) => {
      setState((prev) => ({
        ...prev,
        lastDeliverySeq: Math.max(prev.lastDeliverySeq, deliverySeq),
        lastInvalidationAt: new Date(),
      }));

      // Trigger SWR rehydration for each matching tag
      for (const tag of tags) {
        invokeSafeMutate(
          (key: any) => {
            if (typeof key === "string" && key.includes(tag)) return true;
            if (Array.isArray(key) && key.includes(tag)) return true;
            return false;
          },
          options?.customMutate
        );
      }

      // Also dispatch DOM event for broader cache listening
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lifeos:invalidate", {
            detail: { tags, deliverySeq },
          })
        );
      }

      options?.onInvalidateTags?.(tags);
    },
    [options]
  );

  const handleResyncRequired = useCallback(() => {
    // Full snapshot rehydration: revalidate all active SWR queries
    invokeSafeMutate(() => true, options?.customMutate);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lifeos:resync_required"));
    }
  }, [options]);

  const openLeaderStream = useCallback(() => {
    if (typeof window === "undefined") return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(endpoint);
      eventSourceRef.current = es;

      es.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          isDegraded: false,
        }));
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "INVALIDATE" && Array.isArray(payload.tags)) {
            const seq = payload.deliverySeq || 0;
            coordinatorRef.current?.broadcastInvalidation(payload.tags, seq);
          }
        } catch {
          // Ignore comments or keep-alive pings
        }
      };

      es.addEventListener("projection_sync", (event: any) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.projection) {
            options?.onProjectionSync?.(payload.projection);
          }
        } catch {}
      });

      es.addEventListener("system.resync_required", () => {
        coordinatorRef.current?.broadcastResync();
      });

      es.onerror = () => {
        setState((prev) => ({ ...prev, isConnected: false }));
      };
    } catch (err) {
      console.warn("[useLifeOSReactiveStream] Failed to open EventSource:", err);
    }
  }, [endpoint, options]);

  useEffect(() => {
    const coordinator = TabSyncCoordinator.getInstance();
    coordinatorRef.current = coordinator;

    const unInvalidate = coordinator.onInvalidation((tags, seq) => {
      handleInvalidation(tags, seq);
    });

    const unResync = coordinator.onResync(() => {
      handleResyncRequired();
    });

    coordinator.initialize({
      onLeaderElected: () => {
        setState((prev) => ({ ...prev, role: "LEADER", isDegraded: false }));
        openLeaderStream();
      },
      onFollowerDegraded: () => {
        setState((prev) => ({ ...prev, role: "DEGRADED_FOLLOWER", isDegraded: true }));
      },
    });

    setState((prev) => ({
      ...prev,
      role: coordinator.getRole(),
      isDegraded: coordinator.isDegraded(),
    }));

    // Follower Degraded Mode: Rehydrate on tab focus if degraded
    const onFocus = () => {
      if (coordinator.isDegraded()) {
        handleResyncRequired();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      unInvalidate();
      unResync();
      window.removeEventListener("focus", onFocus);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [openLeaderStream, handleInvalidation, handleResyncRequired]);

  return state;
}
