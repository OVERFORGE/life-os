"use client";

import React from "react";
import { Terminal, ShieldCheck } from "lucide-react";

export function SimulationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 my-6 rounded-lg bg-[#121215] border border-[#27272A] border-dashed text-center">
      <div className="p-3 mb-4 rounded-xl bg-[#18181B] border border-[#27272A] text-[#A1A1AA]">
        <Terminal className="w-8 h-8 text-[#E8414A]" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-white font-mono">
          NO ACTIVE SIMULATION SCENARIO
        </h3>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-[#1E1E22] text-[#A1A1AA] border border-[#27272A]">
          <ShieldCheck className="w-3 h-3 text-[#E8414A]" />
          STANDBY
        </span>
      </div>
      <p className="text-xs text-[#A1A1AA] max-w-md mb-6 leading-relaxed">
        The execution kernel engine is in deterministic standby. Initialize a simulation persona or load a pre-configured scenario to begin execution.
      </p>

      <div className="flex items-center gap-4 text-[11px] font-mono text-[#71717A] bg-[#18181B] px-4 py-2 rounded-md border border-[#27272A]">
        <span>ENGINE: <strong className="text-[#A1A1AA]">IDLE</strong></span>
        <span>•</span>
        <span>SEED: <strong className="text-[#A1A1AA]">0x00000000</strong></span>
        <span>•</span>
        <span>QUEUE: <strong className="text-[#A1A1AA]">0 RUNS</strong></span>
      </div>
    </div>
  );
}
