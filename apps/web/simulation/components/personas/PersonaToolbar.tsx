"use client";

import React from "react";
import { Plus, Search, ChevronDown, Upload, Download, ArrowUpDown } from "lucide-react";
import { PersonaStatusFilter, PersonaSortField } from "../../hooks/usePersonaRegistry";

interface PersonaToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  sortField: PersonaSortField;
  onSortChange: (f: PersonaSortField) => void;
  sortOrder: "asc" | "desc";
  onSortOrderToggle: () => void;
  statusFilter: PersonaStatusFilter;
  onStatusChange: (f: PersonaStatusFilter) => void;
  onNew: () => void;
  totalCount: number;
}

const SORT_OPTIONS: { value: PersonaSortField; label: string }[] = [
  { value: "createdAt", label: "Created Date" },
  { value: "updatedAt", label: "Last Updated" },
  { value: "name", label: "Name" },
  { value: "code", label: "Code" },
];

const STATUS_OPTIONS: { value: PersonaStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "deleted", label: "Soft Deleted" },
  { value: "all", label: "All Personas" },
];

export function PersonaToolbar({
  search,
  onSearchChange,
  sortField,
  onSortChange,
  sortOrder,
  onSortOrderToggle,
  statusFilter,
  onStatusChange,
  onNew,
  totalCount,
}: PersonaToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-4 border-b border-[#27272A]">
      {/* Left: Primary actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#E8414A] hover:bg-[#D62C35] text-white text-xs font-mono font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Persona
        </button>

        {/* Import — disabled */}
        <button
          disabled
          title="Import — Coming Soon"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] text-[#71717A] text-xs font-mono border border-[#27272A] opacity-50 cursor-not-allowed"
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </button>

        {/* Export — disabled */}
        <button
          disabled
          title="Export — Coming Soon"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#18181B] text-[#71717A] text-xs font-mono border border-[#27272A] opacity-50 cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Search + Sort + Filter */}
      <div className="flex items-center gap-2 w-full sm:w-auto">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71717A]" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search code, name, tags..."
            className="h-8 pl-8 pr-3 w-52 bg-[#18181B] border border-[#27272A] rounded-md text-xs font-mono text-white placeholder-[#71717A] focus:outline-none focus:border-[#E8414A]/50 transition-colors"
          />
        </div>

        {/* Sort field */}
        <div className="relative">
          <select
            value={sortField}
            onChange={e => onSortChange(e.target.value as PersonaSortField)}
            className="h-8 pl-3 pr-7 bg-[#18181B] border border-[#27272A] rounded-md text-xs font-mono text-[#A1A1AA] focus:outline-none focus:border-[#E8414A]/50 appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#71717A] pointer-events-none" />
        </div>

        {/* Sort order toggle */}
        <button
          onClick={onSortOrderToggle}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
          className="h-8 w-8 flex items-center justify-center rounded-md bg-[#18181B] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:border-[#3F3F46] transition-colors"
        >
          <ArrowUpDown className={`w-3.5 h-3.5 ${sortOrder === "asc" ? "text-[#E8414A]" : ""}`} />
        </button>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => onStatusChange(e.target.value as PersonaStatusFilter)}
            className="h-8 pl-3 pr-7 bg-[#18181B] border border-[#27272A] rounded-md text-xs font-mono text-[#A1A1AA] focus:outline-none focus:border-[#E8414A]/50 appearance-none cursor-pointer"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#71717A] pointer-events-none" />
        </div>

        {/* Count badge */}
        <span className="px-2 h-8 flex items-center text-[10px] font-mono text-[#71717A] bg-[#18181B] border border-[#27272A] rounded-md whitespace-nowrap">
          {totalCount} {totalCount === 1 ? "record" : "records"}
        </span>
      </div>
    </div>
  );
}
