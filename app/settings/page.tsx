"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [derived, setDerived] = useState<any>(null);
  const [overrides, setOverrides] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setData(d);
        setOverrides(d.overrides || {});
      });

    fetch("/api/settings/derived")
      .then(r => r.json())
      .then(d => setDerived(d?.derived || null));
  }, []);

  if (!data) {
    return <div className="p-6 text-gray-400">Loading settings…</div>;
  }

  /* 🔒 SAFE DEFAULTS */
  const effective = data.effective || {};
  const phaseThresholds = effective?.phases?.thresholds || {};
  const phaseWeights = effective?.phases?.weights || {};
  const goalWeights = effective?.goals?.pressureWeights || {};

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

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-4xl mx-auto p-6 space-y-10">

        <h1 className="text-2xl font-semibold">System Settings</h1>

        {/* ==================== SYSTEM LEARNED (V2) ==================== */}
        {derived && (
          <Section
            title="System-Learned Optimization (V2)"
            description="Automatically calibrated by your behavior."
          >
            {Object.entries(derived).map(([k, v]: any) => (
              <DerivedRow key={k} label={k} metric={v} />
            ))}
          </Section>
        )}

        {/* ==================== PHASE THRESHOLDS ==================== */}
        <Section
          title="Phase Detection Thresholds"
          description="Conditions that trigger phase changes."
        >
          {Object.entries(phaseThresholds).map(([phase, values]: any) =>
            Object.entries(values || {}).map(([key, val]: any) => (
              <EditableNumber
                key={`${phase}-${key}`}
                label={`${phase}: ${key}`}
                value={get(
                  ["phases", "thresholds", phase, key],
                  val
                )}
                onChange={(v) =>
                  set(["phases", "thresholds", phase, key], v)
                }
              />
            ))
          )}
        </Section>

        {/* ==================== PHASE WEIGHTS ==================== */}
        <Section
          title="Phase Signal Weights"
          description="How strongly each signal affects phase scoring."
        >
          {Object.entries(phaseWeights).map(([k, v]: any) => (
            <EditableNumber
              key={k}
              label={k}
              value={get(["phases", "weights", k], v)}
              step={0.05}
              onChange={(val) => set(["phases", "weights", k], val)}
            />
          ))}
        </Section>

        {/* ==================== GOAL LOAD ==================== */}
        <Section
          title="Goal Load Weights"
          description="How goals contribute to system pressure."
        >
          {Object.entries(goalWeights).map(([k, v]: any) => (
            <EditableNumber
              key={k}
              label={k}
              value={get(["goals", "pressureWeights", k], v)}
              step={0.05}
              onChange={(val) =>
                set(["goals", "pressureWeights", k], val)
              }
            />
          ))}
        </Section>

        {/* ==================== ACTIONS ==================== */}
        <div className="flex gap-4 pt-6">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-white text-black font-medium"
          >
            {saving ? "Saving…" : "Save overrides"}
          </button>

          <button
            onClick={reset}
            className="px-5 py-2 rounded-lg border border-[#232632]"
          >
            Reset to system defaults
          </button>
        </div>

      </div>
    </div>
  );
}

/* ==================== HELPERS ==================== */

function Section({ title, description, children }: any) {
  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-gray-400">{description}</div>
      {children}
    </div>
  );
}

function EditableNumber({ label, value, step = 0.1, onChange }: any) {
  return (
    <div className="flex justify-between items-center">
      <div className="text-sm text-gray-300">{label}</div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-[#0f1115] border border-[#232632] rounded px-2 py-1 text-sm"
      />
    </div>
  );
}

function DerivedRow({ label, metric }: any) {
  return (
    <div className="flex justify-between">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-gray-500">{metric.reason}</div>
      </div>
      <div className="font-mono text-sm">
        {metric.value.toFixed(2)}
      </div>
    </div>
  );
}
