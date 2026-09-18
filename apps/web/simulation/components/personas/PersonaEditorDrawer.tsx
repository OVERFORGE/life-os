"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronDown, ChevronRight, Lock, ShieldCheck, Activity } from "lucide-react";
import { SimulationPersonaDTO, CreatePersonaPayload, UpdatePersonaPayload } from "../../types";
import {
  TRAIT_CATEGORIES,
  INITIAL_STATE_FIELDS,
  LIFESTYLE_FIELDS,
  MOTIVATION_FIELDS,
  IDENTITY_FIELDS,
  PERSONA_ARCHETYPES,
  PersonaTemplate,
} from "../../personas";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface PersonaEditorDrawerProps {
  persona: SimulationPersonaDTO | null; // null = create mode
  prefill?: PersonaTemplate | null;
  onSave: (payload: CreatePersonaPayload | UpdatePersonaPayload) => Promise<void>;
  onClose: () => void;
  isSaving?: boolean;
  error?: string | null;
}

/* ─── Section Accordion ─────────────────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#27272A] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0E0E11] hover:bg-[#18181B] transition-colors text-left"
      >
        <div>
          <div className="text-xs font-mono font-semibold text-white uppercase tracking-wider">{title}</div>
          {subtitle && <div className="text-[11px] text-[#71717A] mt-0.5">{subtitle}</div>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-[#71717A]" /> : <ChevronRight className="w-4 h-4 text-[#71717A]" />}
      </button>
      {open && <div className="p-4 bg-[#121215] space-y-4">{children}</div>}
    </div>
  );
}

/* ─── Trait Slider Row ──────────────────────────────────────────────────────── */

function TraitSlider({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(100, Math.max(0, Number(e.target.value)));
    if (!isNaN(v)) onChange(v);
  };

  const accent = value >= 70 ? "#E8414A" : value >= 40 ? "#A1A1AA" : "#71717A";

  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-mono text-[#A1A1AA]" title={description}>
            {label}
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={handleInput}
            className="w-12 h-6 text-center text-xs font-mono bg-[#0E0E11] border border-[#27272A] rounded text-white focus:outline-none focus:border-[#E8414A]/50"
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ accentColor: accent }}
          className="w-full h-1.5 rounded-full cursor-pointer appearance-none bg-[#27272A]"
        />
      </div>
    </div>
  );
}

/* ─── Field Row ─────────────────────────────────────────────────────────────── */

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <label className="text-[11px] font-mono text-[#A1A1AA] pt-2">{label}</label>
      <div>{children}</div>
    </div>
  );
}

const inputCls = "w-full h-8 px-3 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-white placeholder-[#71717A] focus:outline-none focus:border-[#E8414A]/50 transition-colors";
const selectCls = "w-full h-8 px-3 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-white focus:outline-none focus:border-[#E8414A]/50 transition-colors";

/* ─── Main Editor Drawer ────────────────────────────────────────────────────── */

export function PersonaEditorDrawer({
  persona,
  prefill,
  onSave,
  onClose,
  isSaving = false,
  error,
}: PersonaEditorDrawerProps) {
  const isEdit = persona !== null;

  // ── Form State ──
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [archetype, setArchetype] = useState<string>("CUSTOM");
  const [tags, setTags] = useState("");

  const [promptVersion, setPromptVersion] = useState("v1.0.0");
  const [personaVersion, setPersonaVersion] = useState("1.0.0");
  const [schemaVersion, setSchemaVersion] = useState("1.0.0");
  const [internalNotes, setInternalNotes] = useState("");

  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [traits, setTraits] = useState<Record<string, number>>({});
  const [initialState, setInitialState] = useState<Record<string, number>>({});
  const [lifestyle, setLifestyle] = useState<Record<string, string>>({});
  const [motivation, setMotivation] = useState<Record<string, string>>({});

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ── Initialize from persona or prefill ──
  useEffect(() => {
    if (isEdit && persona) {
      setCode(persona.code);
      setName(persona.name);
      setDescription(persona.description ?? "");
      setArchetype(persona.archetype ?? "CUSTOM");
      setTags((persona.tags ?? []).join(", "));
      setPromptVersion(persona.promptVersion ?? "v1.0.0");
      setPersonaVersion(persona.personaVersion ?? "1.0.0");
      setSchemaVersion(persona.schemaVersion ?? "1.0.0");
      setInternalNotes((persona.metadata as any)?.internalNotes ?? "");

      setIdentity(initIdentity(persona.identity));
      setTraits(initTraits(persona.traits as Record<string, number>));
      setInitialState(initInitialState(persona.initialState as Record<string, number>));
      setLifestyle(initLifestyle(persona.lifestyle));
      setMotivation(initMotivation(persona.motivation));
    } else if (prefill) {
      setArchetype(prefill.archetype);
      setTags(prefill.tags.join(", "));
      setIdentity(initIdentity(prefill.identity));
      setTraits(initTraits(prefill.traits));
      setInitialState(initInitialState(prefill.initialState));
      setLifestyle(initLifestyle(prefill.lifestyle));
      setMotivation(initMotivation(prefill.motivation));
    } else {
      setIdentity(initIdentity({}));
      setTraits(initTraits({}));
      setInitialState(initInitialState({}));
      setLifestyle(initLifestyle({}));
      setMotivation(initMotivation({}));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, prefill]);

  // ── Helpers ──
  function initIdentity(base?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, def] of Object.entries(IDENTITY_FIELDS)) out[k] = base?.[k] ?? def.default;
    return out;
  }
  function initTraits(base: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const cat of TRAIT_CATEGORIES) for (const t of cat.traits) out[t.key] = base[t.key] ?? t.defaultValue;
    return out;
  }
  function initInitialState(base: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const f of INITIAL_STATE_FIELDS) out[f.key] = base[f.key] ?? f.defaultValue;
    return out;
  }
  function initLifestyle(base?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, def] of Object.entries(LIFESTYLE_FIELDS)) out[k] = base?.[k] ?? def.default;
    return out;
  }
  function initMotivation(base?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, def] of Object.entries(MOTIVATION_FIELDS)) out[k] = base?.[k] ?? def.default;
    return out;
  }

  const setTrait = useCallback((key: string, value: number) => {
    setTraits(prev => ({ ...prev, [key]: value }));
  }, []);

  const setStateField = useCallback((key: string, value: number) => {
    setInitialState(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Validation ──
  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!code.trim()) errs.code = "Code is required.";
    if (!name.trim()) errs.name = "Name is required.";
    if (code && !/^[A-Z0-9_-]+$/i.test(code.trim())) errs.code = "Code must contain only letters, numbers, hyphens, or underscores.";
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
    const payload: CreatePersonaPayload | UpdatePersonaPayload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      archetype,
      identity,
      traits,
      initialState,
      lifestyle,
      motivation,
      metadata: { archetype, internalNotes },
      promptVersion,
      personaVersion,
      schemaVersion,
      tags: tagList,
    };
    await onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="w-full max-w-2xl bg-[#09090B] border-l border-[#27272A] flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A] shrink-0 bg-[#0E0E11]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-semibold text-white uppercase tracking-wider">
                {isEdit ? "Edit Persona" : "New Persona"}
              </h2>
              {persona?.personaUid && (
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#1E1E22] text-[#E8414A] border border-[#27272A]">
                  {persona.personaUid}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#71717A] mt-0.5">
              {isEdit ? `Editing: ${persona?.code}` : "Configure a deterministic digital human profile"}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── 1. Identity & Demographic Profile ── */}
          <Section title="Identity & Demographic Profile" subtitle="Code, name, archetype classification, and structured demographic enums." defaultOpen>
            {/* Persona UID (Immutable) */}
            {isEdit && (
              <FieldRow label="Persona UID (Immutable)">
                <div className="h-8 flex items-center px-3 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-[#E8414A] font-semibold">
                  {persona.personaUid}
                </div>
                <p className="text-[10px] text-[#71717A] mt-1">Export/import-safe kernel identifier. Read-only.</p>
              </FieldRow>
            )}

            <FieldRow label="Code *">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. PERSONA_FOUNDER_01"
                className={inputCls}
                disabled={isEdit}
              />
              {validationErrors.code && <p className="text-[11px] text-red-400 mt-1">{validationErrors.code}</p>}
              {isEdit && <p className="text-[11px] text-[#71717A] mt-1">Code cannot be changed after creation.</p>}
            </FieldRow>

            <FieldRow label="Name *">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Founder Persona"
                className={inputCls}
              />
              {validationErrors.name && <p className="text-[11px] text-red-400 mt-1">{validationErrors.name}</p>}
            </FieldRow>

            <FieldRow label="Description">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief behavioral description..."
                rows={2}
                className="w-full px-3 py-2 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-white placeholder-[#71717A] focus:outline-none focus:border-[#E8414A]/50 resize-none transition-colors"
              />
            </FieldRow>

            <FieldRow label="Archetype">
              <select value={archetype} onChange={e => setArchetype(e.target.value)} className={selectCls}>
                {PERSONA_ARCHETYPES.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                ))}
              </select>
            </FieldRow>

            {/* Demographic Predefined Enums (Refinement 7) */}
            <div className="pt-2 border-t border-[#27272A]/50 space-y-3">
              <div className="text-[10px] font-mono text-[#E8414A] uppercase tracking-wider font-semibold">Demographic Parameters (Deterministic Prompts)</div>
              {(Object.entries(IDENTITY_FIELDS) as [string, { label: string; options: readonly string[]; default: string }][]).map(([key, field]) => (
                <FieldRow key={key} label={field.label}>
                  <select
                    value={identity[key] ?? field.default}
                    onChange={e => setIdentity(prev => ({ ...prev, [key]: e.target.value }))}
                    className={selectCls}
                  >
                    {field.options.map(opt => (
                      <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </FieldRow>
              ))}
            </div>

            <FieldRow label="Tags">
              <input
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="founder, high-performance, entrepreneurship"
                className={inputCls}
              />
              <p className="text-[11px] text-[#71717A] mt-1">Comma-separated.</p>
            </FieldRow>
          </Section>

          {/* ── 2. Lifestyle ── */}
          <Section title="Lifestyle" subtitle="Daily rhythms and environmental patterns.">
            {(Object.entries(LIFESTYLE_FIELDS) as [string, { label: string; options: readonly string[]; default: string }][]).map(([key, field]) => (
              <FieldRow key={key} label={field.label}>
                <select
                  value={lifestyle[key] ?? field.default}
                  onChange={e => setLifestyle(prev => ({ ...prev, [key]: e.target.value }))}
                  className={selectCls}
                >
                  {field.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </FieldRow>
            ))}
          </Section>

          {/* ── 3. Motivation ── */}
          <Section title="Motivation" subtitle="Goal orientation, planning horizon, and execution style.">
            {(Object.entries(MOTIVATION_FIELDS) as [string, { label: string; options: readonly string[]; default: string }][]).map(([key, field]) => (
              <FieldRow key={key} label={field.label}>
                <select
                  value={motivation[key] ?? field.default}
                  onChange={e => setMotivation(prev => ({ ...prev, [key]: e.target.value }))}
                  className={selectCls}
                >
                  {field.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </FieldRow>
            ))}
          </Section>

          {/* ── 4. Behavior Traits ── */}
          <Section title="Behavior Traits" subtitle="Categorized psychological and behavioral parameters (0–100).">
            {TRAIT_CATEGORIES.map(cat => (
              <div key={cat.key} className="space-y-3">
                <div className="pb-1 border-b border-[#27272A]">
                  <div className="text-[11px] font-mono font-semibold text-[#E8414A] uppercase tracking-wider">{cat.label}</div>
                  <div className="text-[10px] text-[#71717A]">{cat.description}</div>
                </div>
                <div className="space-y-3">
                  {cat.traits.map(trait => (
                    <TraitSlider
                      key={trait.key}
                      label={trait.label}
                      description={trait.description}
                      value={traits[trait.key] ?? trait.defaultValue}
                      onChange={v => setTrait(trait.key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </Section>

          {/* ── 5. Initial State ── */}
          <Section title="Initial State" subtitle="Baseline metrics at simulation start (0–100).">
            <div className="space-y-3">
              {INITIAL_STATE_FIELDS.map(field => (
                <TraitSlider
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={initialState[field.key] ?? field.defaultValue}
                  onChange={v => setStateField(field.key, v)}
                />
              ))}
            </div>
          </Section>

          {/* ── 6. Behavior Policy (Placeholder) ── */}
          <Section title="Behavior Policy" subtitle="Decision rules and action policy configuration." defaultOpen={false}>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="p-2.5 rounded-lg bg-[#18181B] border border-[#27272A]">
                <Lock className="w-5 h-5 text-[#71717A]" />
              </div>
              <div className="text-xs font-mono font-semibold text-[#A1A1AA] uppercase tracking-wider">
                RESERVED — FUTURE PHASE
              </div>
              <p className="text-[11px] text-[#71717A] max-w-xs leading-relaxed">
                Behavior Policies define how this persona makes decisions, prioritizes actions, and responds to opportunity signals.
              </p>
              <div className="px-3 py-1.5 rounded bg-[#E8414A]/10 text-[#E8414A] text-[10px] font-mono border border-[#E8414A]/20">
                PHASE 1.3+
              </div>
            </div>
          </Section>

          {/* ── 7. Read-Only Analytics (Refinement 6) ── */}
          {isEdit && (
            <Section title="Simulation Analytics (Read-Only)" subtitle="Historical simulation telemetry and run statistics." defaultOpen={false}>
              <div className="grid grid-cols-3 gap-3 font-mono text-center">
                <div className="p-3 rounded-md bg-[#0E0E11] border border-[#27272A]">
                  <div className="text-[10px] text-[#71717A] uppercase">Total Runs</div>
                  <div className="text-lg font-bold text-white mt-1">{persona?.analytics?.simulationCount ?? 0}</div>
                </div>
                <div className="p-3 rounded-md bg-[#0E0E11] border border-[#27272A]">
                  <div className="text-[10px] text-[#71717A] uppercase">Last Simulation</div>
                  <div className="text-xs text-[#A1A1AA] mt-2 font-medium">
                    {persona?.analytics?.lastSimulationAt ? new Date(persona.analytics.lastSimulationAt).toLocaleDateString() : "Never"}
                  </div>
                </div>
                <div className="p-3 rounded-md bg-[#0E0E11] border border-[#27272A]">
                  <div className="text-[10px] text-[#71717A] uppercase">Avg. Outcome</div>
                  <div className="text-lg font-bold text-[#E8414A] mt-1">
                    {persona?.analytics?.averageOutcomeScore !== null ? `${persona?.analytics?.averageOutcomeScore}%` : "—"}
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-mono text-[#71717A] flex items-center gap-1 mt-1">
                <Activity className="w-3 h-3 text-[#E8414A]" /> Analytics are updated exclusively by completed simulation engine runs.
              </p>
            </Section>
          )}

          {/* ── 8. Metadata & Independent Versioning ── */}
          <Section title="Metadata & Independent Versioning" subtitle="Schema version, prompt version, persona version, and validation checksum." defaultOpen={false}>
            <FieldRow label="Persona Version">
              <input
                type="text"
                value={personaVersion}
                onChange={e => setPersonaVersion(e.target.value)}
                className={inputCls}
                placeholder="1.0.0"
              />
            </FieldRow>

            <FieldRow label="Schema Version">
              <input
                type="text"
                value={schemaVersion}
                onChange={e => setSchemaVersion(e.target.value)}
                className={inputCls}
                placeholder="1.0.0"
              />
              <p className="text-[10px] text-[#71717A] mt-1">Tracks document structure independent of LLM prompt versioning.</p>
            </FieldRow>

            <FieldRow label="Prompt Version">
              <input
                type="text"
                value={promptVersion}
                onChange={e => setPromptVersion(e.target.value)}
                className={inputCls}
                placeholder="v1.0.0"
              />
              <p className="text-[10px] text-[#71717A] mt-1">Tracks prompt schema evolution for LLM interactions.</p>
            </FieldRow>

            {isEdit && (
              <>
                <FieldRow label="Validation Checksum">
                  <div className="h-8 flex items-center gap-1.5 px-3 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{persona?.validation?.passed ? "VERIFIED (CHECKSUM OK)" : "PENDING REPLAY VERIFICATION"}</span>
                  </div>
                </FieldRow>
                <FieldRow label="Template Source">
                  <div className="h-8 flex items-center px-3 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-[#71717A]">
                    {persona?.templateId ? `${persona.templateId} (v${persona.templateVersion})` : "Custom Blueprint"}
                  </div>
                </FieldRow>
              </>
            )}

            <FieldRow label="Internal Notes">
              <textarea
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                placeholder="Engineering notes, known issues, TODO..."
                rows={3}
                className="w-full px-3 py-2 bg-[#0E0E11] border border-[#27272A] rounded-md text-xs font-mono text-white placeholder-[#71717A] focus:outline-none focus:border-[#E8414A]/50 resize-none transition-colors"
              />
            </FieldRow>
          </Section>

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-md bg-red-900/20 border border-red-900/40 text-xs font-mono text-red-400">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#27272A] bg-[#0E0E11] shrink-0">
          <span className="text-[11px] font-mono text-[#71717A]">
            {isEdit ? `Editing · ${persona?.code}` : "New Persona · All changes saved to MongoDB"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 text-xs font-mono text-[#A1A1AA] border border-[#27272A] rounded-md bg-[#18181B] hover:bg-[#27272A] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isSaving}
              className="h-8 px-4 text-xs font-mono bg-[#E8414A] hover:bg-[#D62C35] text-white rounded-md transition-colors disabled:opacity-60"
            >
              {isSaving ? "Saving..." : isEdit ? "Save Changes" : "Create Persona"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
