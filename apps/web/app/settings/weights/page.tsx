"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/* ===================================================== */
/* SETTINGS PAGE — V1 Overrides + V2 Learned Sensitivity */
/* ===================================================== */

export default function WeightsPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [derived, setDerived] = useState<any>(null);
  const [overrides, setOverrides] = useState<any>({});
  const [saving, setSaving] = useState(false);

  /* ---------------- Load Settings ---------------- */

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setOverrides(d.overrides || {});
      });

    fetch("/api/settings/derived")
      .then((r) => r.json())
      .then((d) => setDerived(d?.derived || null));
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#161618] p-8 text-[#ECE7E3]/70 flex items-center justify-center text-sm font-medium">
        <div className="animate-pulse">Loading system state…</div>
      </div>
    );
  }

  /* ---------------- SAFE DEFAULTS ---------------- */

  const effective = data?.effective || {};

  const phaseThresholds = effective?.phases?.thresholds || {};
  const phaseWeights = effective?.phases?.weights || {};

  const goalWeights = effective?.goals?.pressureWeights || {};

  /* ---------------- Save Overrides ---------------- */

  async function save() {
    setSaving(true);

    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });

    setSaving(false);
  }

  async function reset() {
    await fetch("/api/settings", { method: "DELETE" });
    window.location.reload();
  }

  /* ---------------- Override Helpers ---------------- */

  function set(path: string[], value: number) {
    setOverrides((o: any) => {
      const copy = structuredClone(o);
      let ref = copy;

      for (let i = 0; i < path.length - 1; i++) {
        ref[path[i]] ||= {};
        ref = ref[path[i]];
      }

      ref[path[path.length - 1]] = value;
      return copy;
    });
  }

  function get(path: string[], fallback: number) {
    let ref = overrides;
    for (const p of path) ref = ref?.[p];
    return ref ?? fallback;
  }

  /* ===================================================== */
  /* UI                                                     */
  /* ===================================================== */

  return (
    <div className="min-h-screen bg-[#161618] text-[#FFFDFC] selection:bg-[#E8414A]/20 font-sans flex flex-col">
      
      {/* Header */}
      <div className="flex items-center px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm mr-4"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Algorithm Weights</h1>
          <p className="text-sm text-gray-400 mt-1">Tune LifeOS V1 Phase & Goal weights</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-4xl mx-auto space-y-10 pb-20">

          {/* ===================================================== */}
          {/* V2 — SYSTEM LEARNED OPTIMIZATION (READ ONLY)           */}
          {/* ===================================================== */}

          {derived && typeof derived === "object" && (
            <Section
              title="System-Learned Optimization (V2)"
              description="These values are automatically calibrated by LifeOS from your behavior."
            >
              {Object.entries(derived || {}).map(([key, metric]: any) => (
                <DerivedRow key={key} label={key} metric={metric} />
              ))}
            </Section>
          )}

          {/* ===================================================== */}
          {/* PHASE THRESHOLDS                                     */}
          {/* ===================================================== */}

          <Section
            title="Phase Detection Thresholds"
            description="Rules that trigger phase transitions (burnout, grind, slump, recovery…)."
          >
            {Object.keys(phaseThresholds).length === 0 && (
              <div className="text-sm text-[#ECE7E3]/70">
                No thresholds found.
              </div>
            )}

            {Object.entries(phaseThresholds).map(([phase, values]: any) => (
              <div key={phase} className="space-y-3 pt-4 border-t border-[#2A2B2F] first:border-0 first:pt-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#ECE7E3]">
                  {phase}
                </div>

                {Object.entries(values || {}).map(([key, val]: any) => (
                  <EditableNumber
                    key={`${phase}-${key}`}
                    label={key}
                    value={get(
                      ["phases", "thresholds", phase, key],
                      val
                    )}
                    onChange={(v) =>
                      set(["phases", "thresholds", phase, key], v)
                    }
                  />
                ))}
              </div>
            ))}
          </Section>

          {/* ===================================================== */}
          {/* PHASE SIGNAL WEIGHTS                                 */}
          {/* ===================================================== */}

          <Section
            title="Phase Signal Weights"
            description="How strongly each signal affects phase scoring."
          >
            {Object.keys(phaseWeights).length === 0 && (
              <div className="text-sm text-[#ECE7E3]/70">
                No phase weights found.
              </div>
            )}

            {Object.entries(phaseWeights).map(([key, val]: any) => (
              <EditableNumber
                key={key}
                label={key}
                value={get(["phases", "weights", key], val)}
                step={0.05}
                onChange={(v) => set(["phases", "weights", key], v)}
              />
            ))}
          </Section>

          {/* ===================================================== */}
          {/* GOAL LOAD PRESSURE WEIGHTS                            */}
          {/* ===================================================== */}

          <Section
            title="Goal Load Pressure Weights"
            description="How goal cadence, ambition, and conflicts contribute to pressure."
          >
            {Object.keys(goalWeights).length === 0 && (
              <div className="text-sm text-[#ECE7E3]/70">
                No goal pressure weights found.
              </div>
            )}

            {Object.entries(goalWeights).map(([key, val]: any) => (
              <EditableNumber
                key={key}
                label={key}
                value={get(["goals", "pressureWeights", key], val)}
                step={0.05}
                onChange={(v) =>
                  set(["goals", "pressureWeights", key], v)
                }
              />
            ))}
          </Section>

          {/* ===================================================== */}
          {/* ACTIONS                                               */}
          {/* ===================================================== */}

          <div className="flex gap-4 pt-8 border-t border-[#1F2023]">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-[#E8414A] hover:bg-[#D62C35] text-white font-bold text-[15px] transition-all disabled:opacity-50 disabled:hover:bg-[#E8414A] shadow-sm flex-1"
            >
              {saving ? "Saving…" : "Save Overrides"}
            </button>

            <button
              onClick={reset}
              className="px-5 py-3 rounded-xl border border-[#2A2B2F] bg-[#1F2023] hover:bg-[#2A2B2F] text-gray-300 font-bold text-[15px] transition-colors shadow-sm flex-1"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================================================== */
/* COMPONENTS                                             */
/* ===================================================== */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] shadow-sm rounded-2xl p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="font-bold text-lg">{title}</div>
        <div className="text-sm text-gray-400">{description}</div>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function EditableNumber({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex justify-between items-center py-2 group">
      <div className="text-sm text-gray-300 capitalize font-semibold transition-colors group-hover:text-white">{label}</div>

      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="
          w-24 bg-[#161618]
          border border-[#2A2B2F]
          rounded-lg px-3 py-2
          text-sm text-white font-mono font-medium
          transition-all outline-none
          focus:border-[#E8414A]/50 focus:ring-1 focus:ring-[#E8414A]/20
          hover:border-[#2A2B2F]/80
        "
      />
    </div>
  );
}

function DerivedRow({
  label,
  metric,
}: {
  label: string;
  metric: any;
}) {
  if (!metric) return null;

  return (
    <div className="flex justify-between items-center py-4 border-b border-[#2A2B2F] last:border-none">
      <div className="space-y-1">
        <div className="text-sm font-bold text-gray-200 capitalize">{label}</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {metric.reason || "Learned adjustment"}
        </div>
      </div>

      <div className="font-mono text-[15px] font-bold text-[#E8414A] bg-[#E8414A]/10 px-3 py-1 rounded-lg">
        {typeof metric.value === "number"
          ? metric.value.toFixed(2)
          : "—"}
      </div>
    </div>
  );
}
