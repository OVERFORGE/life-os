"use client";

import React from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { Construction, Lock } from "lucide-react";

interface AdminPlaceholderPageProps {
  title: string;
  description: string;
  moduleName: string;
}

export function AdminPlaceholderPage({
  title,
  description,
  moduleName,
}: AdminPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} description={description} badge="COMING SOON" />

      <div className="flex flex-col items-center justify-center p-16 rounded-lg bg-[#121215] border border-[#27272A] border-dashed text-center">
        <div className="p-3 mb-4 rounded-xl bg-[#18181B] border border-[#27272A] text-[#71717A]">
          <Construction className="w-8 h-8 text-[#E8414A]" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
            {moduleName} — UNDER CONSTRUCTION
          </h3>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20">
            PHASE 1.1 PLACEHOLDER
          </span>
        </div>
        <p className="text-xs text-[#A1A1AA] max-w-md mb-6 leading-relaxed">
          This subsystem is scheduled for development in future LifeOS Simulation Lab phases. Architectural contracts and navigation endpoints have been established.
        </p>

        <div className="inline-flex items-center gap-2 text-xs font-mono text-[#71717A] bg-[#18181B] px-4 py-2 rounded border border-[#27272A]">
          <Lock className="w-3.5 h-3.5" />
          <span>STATUS: ROUTE REGISTERED • FEATURE LOCKED</span>
        </div>
      </div>
    </div>
  );
}
