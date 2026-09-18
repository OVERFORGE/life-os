"use client";

import React from "react";
import { Cpu, Terminal, ShieldCheck } from "lucide-react";
import { SimulationRunDTO, RuntimeStatus } from "../../types";

interface RuntimeHeaderProps {
  activeRun: SimulationRunDTO | null;
}

const STATUS_STYLE: Record<RuntimeStatus, { bg: string; text: string; border: string; label: string }> = {
  CREATED: { bg: "bg-[#1E1E22]", text: "text-[#A1A1AA]", border: "border-[#27272A]", label: "CREATED" },
  INITIALIZING: { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-800/40", label: "INITIALIZING" },
  RUNNING: { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800/40", label: "RUNNING" },
  PAUSED: { bg: "bg-amber-950/40", text: "text-amber-400", border: "border-amber-800/40", label: "PAUSED" },
  COMPLETED: { bg: "bg-indigo-950/40", text: "text-indigo-400", border: "border-indigo-800/40", label: "COMPLETED" },
  FAILED: { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-800/40", label: "FAILED" },
  CANCELLED: { bg: "bg-zinc-900", text: "text-zinc-500", border: "border-zinc-800", label: "CANCELLED" },
};

export function RuntimeHeader({ activeRun }: RuntimeHeaderProps) {
  const statusInfo = activeRun ? STATUS_STYLE[activeRun.status] : STATUS_STYLE.CREATED;

  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-[#27272A]">
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="p-1.5 rounded-md bg-[#1E1E22] border border-[#27272A] text-[#E8414A]">
            <Cpu className="w-4 h-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white font-mono">
            Simulation Runtime Engine
          </h1>
          <span className={`px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
            {statusInfo.label}
          </span>
        </div>
        <p className="text-sm text-[#A1A1AA] max-w-2xl font-sans">
          Deterministic execution virtual machine managing simulation clock, lifecycle FSM, runtime state, and session telemetry.
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0 mt-1">
        {activeRun && (
          <div className="flex items-center gap-2 font-mono text-xs bg-[#18181B] px-3 py-1.5 rounded-md border border-[#27272A]">
            <Terminal className="w-3.5 h-3.5 text-[#E8414A]" />
            <span className="text-[#E8414A] font-bold">{activeRun.runUid}</span>
            <span className="text-[#71717A]">|</span>
            <span className="text-white">{activeRun.context.personaCode}</span>
          </div>
        )}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1E1E22] border border-[#27272A] text-[11px] font-mono text-[#A1A1AA]">
          <ShieldCheck className="w-3 h-3 text-[#E8414A]" />
          <span>v2.4.0-DETERMINISTIC</span>
        </div>
      </div>
    </div>
  );
}
