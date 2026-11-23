"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-amber-300 text-xs tracking-wide select-none z-50">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="font-semibold">Offline Mode Active</span>
        <span className="text-amber-300/80 hidden sm:inline">
          — Read-only cached state. Speculative writes are disabled to prevent state divergence.
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 font-mono">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>READ-ONLY</span>
      </div>
    </div>
  );
}

