"use client";

import React from "react";
import { Activity, Database, User, Hash } from "lucide-react";
import { SimulationRunDTO } from "../../types";
import { minuteToTime } from "../../engine/clock";

interface RuntimeStateGridProps {
  activeRun: SimulationRunDTO | null;
}

function GridCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#27272A] bg-[#0F0F10] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[10px] font-mono text-[#52525B] uppercase tracking-widest">
        <Icon className="w-3 h-3" />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function GridRow({ label, value, mono = true }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-[#52525B] font-sans shrink-0">{label}</span>
      <span className={`text-[11px] text-[#A1A1AA] ${mono ? "font-mono" : "font-sans"} text-right truncate`}>
        {value}
      </span>
    </div>
  );
}

export function RuntimeStateGrid({ activeRun }: RuntimeStateGridProps) {
  if (!activeRun) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["Runtime State", "Session Context", "Telemetry"].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-[#27272A] bg-[#0F0F10] p-4 h-36 flex items-center justify-center"
          >
            <span className="text-[11px] font-mono text-[#3F3F46]">No active run</span>
          </div>
        ))}
      </div>
    );
  }

  const { state, context, metrics, configuration } = activeRun;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Runtime State */}
      <GridCard title="Runtime State" icon={Activity}>
        <GridRow label="Status" value={activeRun.status} />
        <GridRow label="Tick" value={state.tick.toLocaleString()} />
        <GridRow label="Day" value={`${state.currentDay} / ${configuration.totalDays}`} />
        <GridRow label="Time" value={minuteToTime(state.currentMinute)} />
        <GridRow label="Elapsed" value={`${state.elapsedMinutes} min`} />
      </GridCard>

      {/* Session Context */}
      <GridCard title="Session Context" icon={User}>
        <GridRow label="Run UID" value={activeRun.runUid} />
        <GridRow label="Persona Code" value={context.personaCode} />
        <GridRow label="Persona UID" value={context.personaUid} />
        <GridRow label="Start Time" value={minuteToTime(context.startMinute)} />
        <GridRow label="Tick Interval" value={`${configuration.tickIntervalMinutes}m / tick`} />
      </GridCard>

      {/* Telemetry Metrics */}
      <GridCard title="Telemetry" icon={Database}>
        <GridRow label="Advance Calls" value={metrics.advanceCount} />
        <GridRow label="Pauses" value={metrics.pauseCount} />
        <GridRow label="Resumes" value={metrics.resumeCount} />
        <GridRow label="Elapsed Ticks" value={metrics.elapsedTicks} />
        <GridRow label="Elapsed Min" value={`${metrics.elapsedMinutes} min`} />
      </GridCard>
    </div>
  );
}
