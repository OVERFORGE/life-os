"use client";

import React, { useState, useEffect } from "react";
import { X, Loader2, Cpu } from "lucide-react";
import { StartSimulationPayload } from "../../types";

interface PersonaOption {
  id: string;
  personaUid: string;
  name: string;
  personaCode: string;
  archetype: string;
}

interface StartSimulationModalProps {
  isOpen: boolean;
  isExecuting: boolean;
  onClose: () => void;
  onStart: (payload: StartSimulationPayload) => void;
}

const DEFAULT_CONFIG = {
  totalDays: 1,
  tickIntervalMinutes: 1,
  startDay: 1,
  startMinute: 480, // 08:00
  maxTicks: 1440,
};

export function StartSimulationModal({
  isOpen,
  isExecuting,
  onClose,
  onStart,
}: StartSimulationModalProps) {
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [totalDays, setTotalDays] = useState(DEFAULT_CONFIG.totalDays);
  const [tickIntervalMinutes, setTickIntervalMinutes] = useState(DEFAULT_CONFIG.tickIntervalMinutes);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingPersonas(true);
    fetch("/api/admin/personas?limit=50&status=active")
      .then((r) => r.json())
      .then((data) => {
        const list: PersonaOption[] = (data.personas ?? data.data ?? []).map((p: any) => ({
          id: p._id ?? p.id,
          personaUid: p.personaUid,
          name: p.name,
          personaCode: p.personaCode ?? p.personaUid,
          archetype: p.archetype ?? p.template ?? "unknown",
        }));
        setPersonas(list);
        if (list.length > 0) setSelectedPersonaId(list[0].id);
      })
      .catch(() => setPersonas([]))
      .finally(() => setIsLoadingPersonas(false));
  }, [isOpen]);

  const handleStart = () => {
    if (!selectedPersonaId) return;
    const persona = personas.find((p) => p.id === selectedPersonaId);
    if (!persona) return;
    onStart({
      personaId: persona.id,
      configuration: {
        totalDays,
        tickIntervalMinutes,
        startDay: DEFAULT_CONFIG.startDay,
        startMinute: DEFAULT_CONFIG.startMinute,
        maxTicks: totalDays * (1440 / tickIntervalMinutes),
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[#0F0F10] border border-[#27272A] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A]">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-[#E8414A]" />
            <h2 className="text-sm font-semibold font-mono text-white">New Simulation Run</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#52525B] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Persona Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-widest text-[#52525B]">
              Select Persona
            </label>
            {isLoadingPersonas ? (
              <div className="flex items-center gap-2 h-10 text-[#52525B]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs font-mono">Loading personas...</span>
              </div>
            ) : personas.length === 0 ? (
              <div className="text-xs font-mono text-[#52525B] py-2">
                No active personas found. Create one in Personas first.
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {personas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersonaId(p.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                      selectedPersonaId === p.id
                        ? "border-[#E8414A] bg-[#E8414A]/10"
                        : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold font-sans text-white truncate">{p.name}</div>
                      <div className="text-[10px] font-mono text-[#52525B] mt-0.5">{p.personaUid}</div>
                    </div>
                    <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono uppercase rounded bg-[#27272A] text-[#A1A1AA]">
                      {p.archetype}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-widest text-[#52525B]">
                Total Days
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={totalDays}
                onChange={(e) => setTotalDays(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-white text-sm font-mono focus:outline-none focus:border-[#E8414A] transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-widest text-[#52525B]">
                Tick Interval (min)
              </label>
              <select
                value={tickIntervalMinutes}
                onChange={(e) => setTickIntervalMinutes(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-white text-sm font-mono focus:outline-none focus:border-[#E8414A] transition-colors"
              >
                <option value={1}>1 min / tick</option>
                <option value={5}>5 min / tick</option>
                <option value={15}>15 min / tick</option>
                <option value={30}>30 min / tick</option>
                <option value={60}>60 min / tick</option>
              </select>
            </div>
          </div>

          {/* Runtime starts at info */}
          <div className="text-[10px] font-mono text-[#3F3F46] bg-[#18181B] rounded-lg px-3 py-2 border border-[#27272A]">
            Runtime starts at <span className="text-[#A1A1AA]">08:00, Day 1</span> &mdash;{" "}
            max <span className="text-[#A1A1AA]">{(totalDays * 1440 / tickIntervalMinutes).toLocaleString()} ticks</span> total.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#27272A]">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded text-xs font-mono text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!selectedPersonaId || isExecuting || isLoadingPersonas}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-mono font-semibold transition-colors disabled:opacity-40"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                Start Runtime
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
