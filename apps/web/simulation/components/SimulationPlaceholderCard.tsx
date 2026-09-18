"use client";

import React from "react";
import { LucideIcon, Lock } from "lucide-react";

interface SimulationPlaceholderCardProps {
  title: string;
  icon: LucideIcon;
  subtitle: string;
  countBadge?: string | number;
  emptyText?: string;
  children?: React.ReactNode;
}

export function SimulationPlaceholderCard({
  title,
  icon: Icon,
  subtitle,
  countBadge = "0",
  emptyText = "No items recorded in phase 1.1",
  children,
}: SimulationPlaceholderCardProps) {
  return (
    <div className="flex flex-col rounded-lg bg-[#121215] border border-[#27272A] p-4 transition-all duration-200 hover:border-[#3F3F46]">
      <div className="flex items-center justify-between pb-3 border-b border-[#1E1E22]">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-[#18181B] border border-[#27272A] text-[#A1A1AA]">
            <Icon className="w-3.5 h-3.5 text-[#E8414A]" />
          </span>
          <div>
            <h4 className="text-xs font-semibold text-white font-mono uppercase tracking-wider">
              {title}
            </h4>
            <p className="text-[11px] text-[#71717A]">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#18181B] text-[#A1A1AA] border border-[#27272A]">
            {countBadge}
          </span>
          <span className="p-1 rounded text-[#71717A]" title="Placeholder Section">
            <Lock className="w-3 h-3" />
          </span>
        </div>
      </div>

      <div className="py-6 flex flex-col items-center justify-center text-center">
        {children || (
          <p className="text-xs font-mono text-[#71717A] tracking-tight">
            [ {emptyText} ]
          </p>
        )}
      </div>
    </div>
  );
}
