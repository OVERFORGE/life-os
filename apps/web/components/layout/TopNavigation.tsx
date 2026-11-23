"use client";

import React, { useState, useEffect } from "react";
import { Search, Command, Minus, Square, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
} from "@/lib/desktopBridge";

interface TopNavigationProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function TopNavigation({
  isSidebarCollapsed,
  onToggleSidebar,
}: TopNavigationProps = {}) {
  const { data: session } = useSession();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkMax = async () => {
      const max = await isWindowMaximized();
      if (mounted) setIsMaximized(max);
    };
    checkMax();
    const interval = setInterval(checkMax, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleMinimize = async () => {
    await minimizeWindow();
  };

  const handleMaximize = async () => {
    await toggleMaximizeWindow();
    const max = await isWindowMaximized();
    setIsMaximized(max);
  };

  const handleClose = async () => {
    await closeWindow();
  };

  const userName = session?.user?.name || "Arjun";
  const userInitials =
    userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AJ";

  return (
    <header
      className="flex h-11 w-full shrink-0 items-center justify-between px-4 bg-[#111113] border-b border-[#23242A]/80 select-none z-50"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={handleMaximize}
    >
      {/* Left: LifeOS Studio Pill */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#17171A] border border-[#23242A] shadow-sm select-none"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <span className="w-2 h-2 rounded-full bg-[#D98B2B] shadow-[0_0_8px_rgba(217,139,43,0.9)]" />
          <span className="text-xs font-semibold tracking-tight text-[#F7F5F0]">
            LifeOS Studio
          </span>
        </div>
      </div>

      {/* Right: Search + Profile + Window Controls */}
      <div
        className="flex items-center gap-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {/* Search / Command Palette Trigger */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="flex items-center gap-2.5 rounded-xl bg-[#17171A] border border-[#23242A] px-3.5 py-1.5 text-xs text-[#85827A] transition-all hover:bg-[#1E1F24] hover:border-[#32343D] hover:text-[#C5C2BA] group cursor-pointer"
          title="Search commands, notes (⌘K)"
        >
          <Search size={13} className="text-[#85827A] group-hover:text-[#C5C2BA] transition-colors" />
          <span className="hidden sm:inline text-xs text-[#85827A]">Search commands, notes...</span>
          <div className="flex items-center gap-0.5 rounded bg-[#111113] border border-[#23242A] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#85827A]">
            <Command size={10} />
            <span>K</span>
          </div>
        </button>

        {/* User Profile Avatar with Online Sync Dot */}
        <Link
          href="/settings"
          className="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#D98B2B]/15 border border-[#D98B2B]/30 hover:border-[#D98B2B]/60 transition-all cursor-pointer group"
          title={`Signed in as ${userName} (${session?.user?.email || "Local Vault"})`}
        >
          <span className="text-[11px] font-semibold text-[#F5E6C8] font-mono">
            {userInitials}
          </span>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#6B8E7B] border-2 border-[#111113] shadow-sm"
            title="Vault Synchronized"
          />
        </Link>

        {/* Native Window Controls */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus size={13} strokeWidth={2} />
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition-colors cursor-pointer"
            title="Maximize / Restore"
          >
            <Square size={11} strokeWidth={2} />
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#85827A] hover:text-[#DE4343] hover:bg-[#DE4343]/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}
