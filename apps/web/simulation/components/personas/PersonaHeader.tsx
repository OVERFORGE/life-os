"use client";

import React from "react";
import { Users, ShieldAlert } from "lucide-react";

export function PersonaHeader() {
  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-6 border-b border-[#27272A]">
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="p-1.5 rounded-md bg-[#1E1E22] border border-[#27272A] text-[#E8414A]">
            <Users className="w-4 h-4" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white font-mono">
            Persona Management
          </h1>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase rounded bg-[#E8414A]/10 text-[#E8414A] border border-[#E8414A]/20">
            FOUNDATION MODULE
          </span>
        </div>
        <p className="text-sm text-[#A1A1AA] max-w-2xl font-sans">
          Reusable deterministic behavioral profiles used by the Simulation Engine.
          Each persona represents a complete digital human — traits, lifestyle, motivation, and baseline state.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1E1E22] border border-[#27272A] text-[11px] font-mono text-[#A1A1AA]">
          <ShieldAlert className="w-3 h-3 text-[#E8414A]" />
          <span>INTERNAL LAB ONLY</span>
        </div>
      </div>
    </div>
  );
}
