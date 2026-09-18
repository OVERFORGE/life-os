"use client";

import React from "react";
import { SimulationPersonaDTO } from "../../types";
import { Edit2, Copy, Archive, RotateCcw, Trash2, RefreshCcw } from "lucide-react";

interface PersonaTableProps {
  personas: SimulationPersonaDTO[];
  isLoading: boolean;
  statusFilter: string;
  onEdit: (p: SimulationPersonaDTO) => void;
  onDuplicate: (p: SimulationPersonaDTO) => void;
  onArchive: (p: SimulationPersonaDTO) => void;
  onRestore: (p: SimulationPersonaDTO) => void;
  onSoftDelete: (p: SimulationPersonaDTO) => void;
  onRecover: (p: SimulationPersonaDTO) => void;
  onNew: () => void;
}

const ARCHETYPE_LABELS: Record<string, string> = {
  FOUNDER: "Founder",
  STUDENT: "Student",
  TRADER: "Trader",
  CONTENT_CREATOR: "Content Creator",
  MEDICAL_STUDENT: "Medical Student",
  REMOTE_WORKER: "Remote Worker",
  BURNED_OUT_FOUNDER: "Burned-out Founder",
  CUSTOM: "Custom",
};

function StatusBadge({ persona }: { persona: SimulationPersonaDTO }) {
  if (persona.isDeleted) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/20 text-red-400 border border-red-900/30">
        DELETED
      </span>
    );
  }
  if (!persona.isActive) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1E1E22] text-[#71717A] border border-[#27272A]">
        ARCHIVED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-900/20 text-emerald-400 border border-emerald-900/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      ACTIVE
    </span>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PersonaTable({
  personas,
  isLoading,
  statusFilter,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onSoftDelete,
  onRecover,
  onNew,
}: PersonaTableProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 mt-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 rounded-md bg-[#18181B] border border-[#27272A] animate-pulse" />
        ))}
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 rounded-lg bg-[#121215] border border-[#27272A] border-dashed text-center mt-4">
        <div className="p-3 mb-4 rounded-xl bg-[#18181B] border border-[#27272A]">
          <span className="text-2xl">👤</span>
        </div>
        <h3 className="text-sm font-mono font-semibold text-white mb-1 uppercase tracking-wider">
          {statusFilter === "deleted" ? "NO DELETED PERSONAS" : statusFilter === "archived" ? "NO ARCHIVED PERSONAS" : "NO PERSONAS REGISTERED"}
        </h3>
        <p className="text-xs text-[#71717A] mb-5 max-w-sm">
          {statusFilter === "active"
            ? "No active personas exist yet. Create your first deterministic digital human to begin."
            : `No personas match the current filter.`}
        </p>
        {statusFilter === "active" && (
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-mono transition-colors"
          >
            + Create First Persona
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-[#27272A]">
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="bg-[#0E0E11] border-b border-[#27272A] text-[#71717A] text-[10px] uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Code</th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Archetype</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Prompt Ver.</th>
            <th className="px-4 py-3 text-left">Created</th>
            <th className="px-4 py-3 text-left">Updated</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p, idx) => (
            <tr
              key={p.id}
              className={`border-b border-[#27272A] hover:bg-[#18181B] transition-colors group ${idx === personas.length - 1 ? "border-b-0" : ""}`}
            >
              {/* Code & UID */}
              <td className="px-4 py-3">
                <div className="text-[#E8414A] font-semibold tracking-tight">{p.code}</div>
                {p.personaUid && (
                  <div className="text-[9px] font-mono text-[#71717A] mt-0.5">{p.personaUid}</div>
                )}
              </td>

              {/* Name */}
              <td className="px-4 py-3">
                <button
                  onClick={() => onEdit(p)}
                  className="text-white hover:text-[#E8414A] transition-colors text-left font-medium"
                >
                  {p.name}
                </button>
                {p.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {p.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-[#1E1E22] text-[#71717A] border border-[#27272A]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </td>

              {/* Archetype */}
              <td className="px-4 py-3 text-[#A1A1AA]">
                {ARCHETYPE_LABELS[p.archetype] ?? p.archetype}
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <StatusBadge persona={p} />
              </td>

              {/* Prompt Version */}
              <td className="px-4 py-3 text-[#71717A]">{p.promptVersion}</td>

              {/* Created */}
              <td className="px-4 py-3 text-[#71717A]">{formatDate(p.createdAt)}</td>

              {/* Updated */}
              <td className="px-4 py-3 text-[#71717A]">{formatDate(p.updatedAt)}</td>

              {/* Actions */}
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Edit — shown for non-deleted */}
                  {!p.isDeleted && (
                    <button
                      onClick={() => onEdit(p)}
                      title="Edit"
                      className="p-1.5 rounded hover:bg-[#27272A] text-[#A1A1AA] hover:text-white transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Duplicate — shown for non-deleted */}
                  {!p.isDeleted && (
                    <button
                      onClick={() => onDuplicate(p)}
                      title="Duplicate"
                      className="p-1.5 rounded hover:bg-[#27272A] text-[#A1A1AA] hover:text-white transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Archive / Restore — for non-deleted */}
                  {!p.isDeleted && p.isActive && (
                    <button
                      onClick={() => onArchive(p)}
                      title="Archive"
                      className="p-1.5 rounded hover:bg-[#27272A] text-[#A1A1AA] hover:text-white transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!p.isDeleted && !p.isActive && (
                    <button
                      onClick={() => onRestore(p)}
                      title="Restore to Active"
                      className="p-1.5 rounded hover:bg-[#27272A] text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Soft delete / recover */}
                  {!p.isDeleted ? (
                    <button
                      onClick={() => onSoftDelete(p)}
                      title="Move to Trash"
                      className="p-1.5 rounded hover:bg-[#27272A] text-[#A1A1AA] hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onRecover(p)}
                      title="Recover from Trash"
                      className="p-1.5 rounded hover:bg-[#27272A] text-[#A1A1AA] hover:text-emerald-400 transition-colors"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
