"use client";

import React from "react";
import { Plus, Play, FlaskConical } from "lucide-react";

interface SimulationHeaderProps {
  title?: string;
  description?: string;
}

export function SimulationHeader({
  title = "Simulation Lab",
  description = "Isolated engineering sandbox for agentic persona execution, deterministic replay, state validation, and chaos testing.",
}: SimulationHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#27272A]">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="p-1.5 rounded-md bg-[#1E1E22] border border-[#27272A] text-[#E8414A]">
            <FlaskConical className="w-4 h-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white font-mono">
            {title}
          </h1>
          <span className="ml-2 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wider uppercase rounded-full bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20">
            DETERMINISTIC v1.1
          </span>
        </div>
        <p className="text-sm text-[#A1A1AA] max-w-2xl font-sans">
          {description}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-mono rounded-md bg-[#18181B] text-[#71717A] border border-[#27272A] opacity-60 cursor-not-allowed select-none"
          title="Phase 1.1 — Disabled"
        >
          <Plus className="w-3.5 h-3.5" />
          New Persona
        </button>
        <button
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-mono rounded-md bg-[#E8414A]/20 text-[#E8414A]/60 border border-[#E8414A]/20 opacity-60 cursor-not-allowed select-none"
          title="Phase 1.1 — Disabled"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Run Simulation
        </button>
      </div>
    </div>
  );
}
