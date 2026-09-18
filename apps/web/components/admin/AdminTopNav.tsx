"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, ShieldAlert, Cpu } from "lucide-react";

export function AdminTopNav() {
  const pathname = usePathname();
  const [timeString, setTimeString] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toISOString().replace("T", " ").substring(0, 19) + " UTC"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Generate breadcrumb segments from pathname
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="h-12 border-b border-[#27272A] bg-[#0E0E11] px-4 flex items-center justify-between shrink-0 font-mono text-xs select-none">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-[#A1A1AA]">
        <span className="text-[#71717A]">admin</span>
        {segments.slice(1).map((seg, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="w-3 h-3 text-[#52525B]" />
            <span
              className={
                i === segments.length - 2
                  ? "text-white font-medium capitalize"
                  : "text-[#A1A1AA] capitalize"
              }
            >
              {seg.replace("-", " ")}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Right Controls / Telemetry */}
      <div className="flex items-center gap-4 text-[#71717A]">
        {/* Kernel Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#18181B] border border-[#27272A] text-[11px] text-[#A1A1AA]">
          <Cpu className="w-3 h-3 text-[#E8414A]" />
          <span>v2.4.0-deterministic</span>
        </div>

        {/* Environment Badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20 text-[10px] uppercase font-bold tracking-wider">
          <ShieldAlert className="w-3 h-3" />
          <span>INTERNAL LAB</span>
        </div>

        {/* System Clock */}
        <span className="hidden md:inline text-[11px] text-[#71717A] tracking-tighter">
          {timeString || "2026-08-05 00:00:00 UTC"}
        </span>
      </div>
    </header>
  );
}
