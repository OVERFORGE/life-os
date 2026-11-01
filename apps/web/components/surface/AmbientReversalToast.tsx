/**
 * AmbientReversalToast.tsx
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Transient 15-second visual countdown toast affordance for autonomous action reversals.
 * Provides immediate one-click "Undo" capability, calling the kernel compensation gateway.
 * Clarifies the two-layer governance: client UI displays a 15-second toast, while the
 * kernel authoritatively enforces the 24-hour retention window.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";

export interface ReversibleActionItem {
  executionId: string;
  title: string;
  description?: string;
  executedAt: number;
}

export interface AmbientReversalToastProps {
  action: ReversibleActionItem;
  autoDismissSeconds?: number;
  onReversed?: (executionId: string) => void;
  onDismiss?: () => void;
}

export const AmbientReversalToast: React.FC<AmbientReversalToastProps> = ({
  action,
  autoDismissSeconds = 15,
  onReversed,
  onDismiss,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(autoDismissSeconds);
  const [isReversing, setIsReversing] = useState(false);
  const [isReversed, setIsReversed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isReversed) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isReversed, onDismiss]);

  const handleUndo = useCallback(async () => {
    setIsReversing(true);
    setError(null);

    try {
      const res = await fetch("/api/surface/reversal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId: action.executionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reverse action");
      }

      setIsReversed(true);
      onReversed?.(action.executionId);

      // Auto-dismiss after displaying confirmation
      setTimeout(() => {
        onDismiss?.();
      }, 3000);
    } catch (err: any) {
      setError(err?.message || "Reversal failed");
    } finally {
      setIsReversing(false);
    }
  }, [action.executionId, onReversed, onDismiss]);

  if (secondsRemaining <= 0 && !isReversed) {
    return null;
  }

  const progressPercent = (secondsRemaining / autoDismissSeconds) * 100;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-md flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <h4 className="text-sm font-semibold text-zinc-100">
              {isReversed ? "Action Reversed" : action.title}
            </h4>
          </div>
          {action.description && (
            <p className="mt-1 text-xs text-zinc-400">{action.description}</p>
          )}
        </div>

        {!isReversed && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={isReversing}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
            >
              {isReversing ? "Reverting..." : `Undo (${secondsRemaining}s)`}
            </button>
            <button
              onClick={onDismiss}
              className="text-xs text-zinc-500 hover:text-zinc-300"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {!isReversed && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};

