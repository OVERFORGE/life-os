"use client";

import React from "react";
import { Clock, Calendar } from "lucide-react";
import { SimulationRunDTO } from "../../types";
import { minuteToTime } from "../../engine/clock";

interface RuntimeClockCardProps {
  activeRun: SimulationRunDTO | null;
}

export function RuntimeClockCard({ activeRun }: RuntimeClockCardProps) {
  const tick = activeRun?.state.tick ?? 0;
  const day = activeRun?.state.currentDay ?? 1;
  const currentMinute = activeRun?.state.currentMinute ?? 0;
  const timeString = minuteToTime(currentMinute);
  const totalTicks = activeRun?.state.tick ?? 0;
  const maxTicks = activeRun ? activeRun.configuration.totalDays * 1440 : 1440;
  const progress = Math.min((totalTicks / maxTicks) * 100, 100);

  const [hours, minutes] = timeString.split(":").map(Number);
  const isAM = hours < 12;

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#0F0F10] p-5 flex flex-col gap-4">
      {/* Clock display */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Virtual Clock
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-mono font-bold tracking-tight text-white">
              {timeString}
            </span>
            <span className={`text-sm font-mono font-semibold pb-1 ${isAM ? "text-blue-400" : "text-amber-400"}`}>
              {isAM ? "AM" : "PM"}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Day
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {String(day).padStart(2, "0")}
          </div>
          <div className="text-[10px] font-mono text-[#52525B]">
            of {activeRun?.configuration.totalDays ?? 1}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[10px] font-mono text-[#52525B]">
          <span>TICK {tick.toLocaleString()}</span>
          <span>{progress.toFixed(1)}% ELAPSED</span>
        </div>
        <div className="h-1 w-full rounded-full bg-[#18181B] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#E8414A] to-[#FF6B6B] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
