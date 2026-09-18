"use client";

import React from "react";
import { Play, Pause, FastForward, CheckCircle, RotateCcw, Plus } from "lucide-react";
import { SimulationRunDTO } from "../../types";
import { canAdvance, canPause, canResume, canFinish, canReset } from "../../engine/lifecycle";

interface RuntimeToolbarProps {
  activeRun: SimulationRunDTO | null;
  isExecuting: boolean;
  onStartClick: () => void;
  onAdvance: (ticks: number) => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onReset: () => void;
}

export function RuntimeToolbar({
  activeRun,
  isExecuting,
  onStartClick,
  onAdvance,
  onPause,
  onResume,
  onFinish,
  onReset,
}: RuntimeToolbarProps) {
  const status = activeRun?.status ?? "CREATED";

  const allowAdvance = activeRun ? canAdvance(status) : false;
  const allowPause = activeRun ? canPause(status) : false;
  const allowResume = activeRun ? canResume(status) : false;
  const allowFinish = activeRun ? canFinish(status) : false;
  const allowReset = activeRun ? canReset(status) : false;

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-4 border-b border-[#27272A] font-mono text-xs">
      {/* Start New Run */}
      <button
        onClick={onStartClick}
        disabled={isExecuting}
        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-[#E8414A] hover:bg-[#D62C35] text-white font-medium transition-colors disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
        New Simulation Run
      </button>

      <div className="h-4 w-px bg-[#27272A] mx-1" />

      {/* Advance +1m (1 tick) */}
      <button
        onClick={() => onAdvance(1)}
        disabled={!allowAdvance || isExecuting}
        title="Advance simulation by 1 deterministic tick (+1 min)"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors disabled:opacity-40 disabled:hover:bg-[#18181B]"
      >
        <FastForward className="w-3.5 h-3.5 text-[#E8414A]" />
        Advance (+1m)
      </button>

      {/* Advance +15m (15 ticks) */}
      <button
        onClick={() => onAdvance(15)}
        disabled={!allowAdvance || isExecuting}
        title="Advance simulation by 15 deterministic ticks (+15 mins)"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-[#A1A1AA] hover:text-white border border-[#27272A] transition-colors disabled:opacity-40"
      >
        +15m
      </button>

      {/* Advance +1h (60 ticks) */}
      <button
        onClick={() => onAdvance(60)}
        disabled={!allowAdvance || isExecuting}
        title="Advance simulation by 60 deterministic ticks (+1 hour)"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-[#A1A1AA] hover:text-white border border-[#27272A] transition-colors disabled:opacity-40"
      >
        +1h
      </button>

      <div className="h-4 w-px bg-[#27272A] mx-1" />

      {/* Pause */}
      {allowPause && (
        <button
          onClick={onPause}
          disabled={isExecuting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-amber-400 border border-amber-900/40 transition-colors disabled:opacity-40"
        >
          <Pause className="w-3.5 h-3.5" />
          Pause
        </button>
      )}

      {/* Resume */}
      {allowResume && (
        <button
          onClick={onResume}
          disabled={isExecuting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-800/40 transition-colors disabled:opacity-40"
        >
          <Play className="w-3.5 h-3.5" />
          Resume
        </button>
      )}

      {/* Finish */}
      {allowFinish && (
        <button
          onClick={onFinish}
          disabled={isExecuting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-indigo-400 border border-indigo-900/40 transition-colors disabled:opacity-40"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Finish Run
        </button>
      )}

      {/* Reset */}
      {allowReset && (
        <button
          onClick={onReset}
          disabled={isExecuting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] hover:bg-[#27272A] text-[#71717A] hover:text-white border border-[#27272A] transition-colors disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to 08:00
        </button>
      )}
    </div>
  );
}
