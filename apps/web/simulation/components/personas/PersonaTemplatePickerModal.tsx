"use client";

import React from "react";
import { X, Layers } from "lucide-react";
import { PERSONA_TEMPLATES, PersonaTemplate } from "../../personas";

interface PersonaTemplatePickerProps {
  onSelect: (template: PersonaTemplate) => void;
  onClose: () => void;
}

const TEMPLATE_ICONS: Record<string, string> = {
  FOUNDER: "🚀",
  STUDENT: "📚",
  TRADER: "📈",
  CONTENT_CREATOR: "🎬",
  MEDICAL_STUDENT: "🩺",
  REMOTE_WORKER: "🏠",
  BURNED_OUT_FOUNDER: "🔥",
  BLANK: "⬜",
};

export function PersonaTemplatePickerModal({ onSelect, onClose }: PersonaTemplatePickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0E0E11] border border-[#27272A] rounded-xl w-full max-w-2xl mx-4 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#27272A]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#E8414A]" />
            <h2 className="text-sm font-mono font-semibold text-white uppercase tracking-wider">
              Select Persona Template
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-[#A1A1AA] mb-4 font-sans">
            Templates pre-populate the persona editor with archetype-appropriate defaults.
            All values are fully editable after selection.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PERSONA_TEMPLATES.map(template => (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className="group flex flex-col items-center gap-2 p-4 rounded-lg bg-[#121215] border border-[#27272A] hover:border-[#E8414A]/40 hover:bg-[#1A1A1E] transition-all duration-200 text-left"
              >
                <span className="text-2xl">{TEMPLATE_ICONS[template.id] ?? "👤"}</span>
                <div className="text-center">
                  <div className="text-xs font-mono font-semibold text-white group-hover:text-[#E8414A] transition-colors">
                    {template.label}
                  </div>
                  <div className="text-[10px] text-[#71717A] mt-1 leading-relaxed line-clamp-2">
                    {template.description.split(".")[0]}.
                  </div>
                </div>
                {template.id !== "BLANK" && (
                  <div className="flex flex-wrap gap-1 justify-center">
                    {template.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#1E1E22] text-[#71717A] border border-[#27272A]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#27272A] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-[#A1A1AA] hover:text-white border border-[#27272A] rounded-md bg-[#18181B] hover:bg-[#27272A] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
