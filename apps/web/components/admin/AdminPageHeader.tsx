"use client";

import React from "react";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  actions?: React.ReactNode;
}

export function AdminPageHeader({
  title,
  description,
  badge,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#27272A]">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-semibold tracking-tight text-white font-mono">
            {title}
          </h1>
          {badge && (
            <span className="px-2 py-0.5 text-[10px] font-mono font-medium uppercase rounded bg-[#1E1E22] text-[#A1A1AA] border border-[#27272A]">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-[#A1A1AA] max-w-2xl font-sans">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
