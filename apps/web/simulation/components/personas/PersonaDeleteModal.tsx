"use client";

import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { SimulationPersonaDTO } from "../../types";

interface PersonaDeleteModalProps {
  persona: SimulationPersonaDTO;
  mode: "soft-delete" | "permanent";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PersonaDeleteModal({
  persona,
  mode,
  onConfirm,
  onCancel,
  isLoading = false,
}: PersonaDeleteModalProps) {
  const isPermanent = mode === "permanent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0E0E11] border border-[#27272A] rounded-xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#27272A]">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${isPermanent ? "text-red-500" : "text-yellow-500"}`} />
            <h2 className="text-sm font-mono font-semibold text-white uppercase tracking-wider">
              {isPermanent ? "Permanently Delete Persona" : "Move Persona to Trash"}
            </h2>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-md bg-[#18181B] border border-[#27272A] font-mono text-xs">
            <div className="text-[#E8414A] font-bold">{persona.code}</div>
            <div className="text-white mt-0.5">{persona.name}</div>
            <div className="text-[#71717A] mt-0.5">Archetype: {persona.archetype}</div>
          </div>

          {isPermanent ? (
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              <span className="text-red-400 font-semibold">This action is permanent and irreversible.</span>{" "}
              The persona document will be removed from MongoDB. All trait data, lifestyle configuration, and metadata will be lost.
            </p>
          ) : (
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              This persona will be moved to the Trash and marked as soft-deleted.
              <span className="text-[#E8414A]"> It can be recovered at any time</span> from the Soft Deleted filter.
              No simulation data will be affected.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#27272A]">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="h-8 px-4 text-xs font-mono text-[#A1A1AA] border border-[#27272A] rounded-md bg-[#18181B] hover:bg-[#27272A] hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 h-8 px-4 text-xs font-mono rounded-md transition-colors disabled:opacity-50 ${
              isPermanent
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-[#E8414A]/20 hover:bg-[#E8414A]/30 text-[#E8414A] border border-[#E8414A]/30"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isLoading ? "Processing..." : isPermanent ? "Delete Permanently" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}
