"use client";

import { useEffect, useRef } from "react";

export interface ReactiveInvalidationDetail {
  tags?: string[];
  deliverySeq?: number;
  userId?: string | null;
}

export interface InvalidationCoalescerOptions {
  tags: readonly string[];
  onInvalidate: () => Promise<void> | void;
  userId?: string | null;
  debounceMs?: number;
}

/**
 * Pure coalescer + scope controller for Decision D4 reactive invalidation.
 * Exported separately so unit tests can verify coalescing, tag filtering,
 * user-scoping, and disposal deterministically.
 */
export function createInvalidationCoalescer(options: InvalidationCoalescerOptions) {
  const debounceMs = options.debounceMs ?? 150;
  const tagSet = new Set(options.tags);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pendingRerun = false;
  let disposed = false;

  const execute = async () => {
    if (disposed) return;
    if (inFlight) {
      pendingRerun = true;
      return;
    }
    inFlight = true;
    try {
      await options.onInvalidate();
    } catch (err) {
      console.warn("[useReactiveInvalidation] Refresh callback failed:", err);
    } finally {
      inFlight = false;
      if (pendingRerun && !disposed) {
        pendingRerun = false;
        void execute();
      }
    }
  };

  const schedule = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void execute();
    }, debounceMs);
  };

  const handleInvalidateEvent = (detail?: ReactiveInvalidationDetail) => {
    if (disposed) return;
    // User/session scoping: ignore events belonging to another user
    if (
      options.userId &&
      detail?.userId &&
      detail.userId !== options.userId
    ) {
      return;
    }
    const incomingTags = Array.isArray(detail?.tags) ? detail.tags : [];
    const hasOverlap = incomingTags.some((t) => tagSet.has(t));
    if (!hasOverlap) return;
    schedule();
  };

  const handleResyncEvent = () => {
    if (disposed) return;
    schedule();
  };

  const dispose = () => {
    disposed = true;
    pendingRerun = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    handleInvalidateEvent,
    handleResyncEvent,
    dispose,
  };
}

export interface UseReactiveInvalidationOptions {
  tags: readonly string[];
  onInvalidate: () => Promise<void> | void;
  userId?: string | null;
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Decision D4: Lightweight hook subscribing to `"lifeos:invalidate"` and `"lifeos:resync_required"`
 * for direct-fetch pages without migrating to TanStack Query.
 */
export function useReactiveInvalidation(options: UseReactiveInvalidationOptions): void {
  const onInvalidateRef = useRef(options.onInvalidate);
  onInvalidateRef.current = options.onInvalidate;

  const tagsKey = options.tags.join("|");
  const enabled = options.enabled ?? true;
  const debounceMs = options.debounceMs ?? 150;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const coalescer = createInvalidationCoalescer({
      tags: tagsKey ? tagsKey.split("|") : [],
      userId: options.userId,
      debounceMs,
      onInvalidate: () => onInvalidateRef.current(),
    });

    const onInvalidateListener = (event: Event) => {
      const custom = event as CustomEvent<ReactiveInvalidationDetail>;
      coalescer.handleInvalidateEvent(custom?.detail);
    };

    const onResyncListener = () => {
      coalescer.handleResyncEvent();
    };

    window.addEventListener("lifeos:invalidate", onInvalidateListener);
    window.addEventListener("lifeos:resync_required", onResyncListener);

    return () => {
      window.removeEventListener("lifeos:invalidate", onInvalidateListener);
      window.removeEventListener("lifeos:resync_required", onResyncListener);
      coalescer.dispose();
    };
  }, [tagsKey, options.userId, debounceMs, enabled]);
}
