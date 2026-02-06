"use client";

import { useEffect, useState } from "react";

import { Card } from "@/features/daily-log/ui/Card";
import { InputField } from "@/features/daily-log/ui/InputField";
import { SelectField } from "@/features/daily-log/ui/SelectField";

/* ---------------- Types ---------------- */

type Category = {
  key: string;
  label: string;
};

type InputType =
  | "checkbox"
  | "number"
  | "slider"
  | "text"
  | "textarea";

type Direction = "higher_better" | "lower_better";

/* ---------------- Page ---------------- */

export default function SignalsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [signals, setSignals] = useState<any[]>([]);

  const [form, setForm] = useState<{
    key: string;
    label: string;
    categoryKey: string;
    inputType: InputType;

    direction: Direction;

    unit: string;
    target: string;

    min: string;
    max: string;
    step: string;
  }>({
    key: "",
    label: "",
    categoryKey: "",
    inputType: "number",

    direction: "higher_better",

    unit: "",
    target: "",

    min: "",
    max: "",
    step: "",
  });

  /* ---------------- Load Categories + Signals ---------------- */

  async function loadAll() {
    const c = await fetch("/api/categories").then((r) => r.json());
    setCategories(c.categories || []);

    const s = await fetch("/api/signals").then((r) => r.json());
    setSignals(s.signals || []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  /* ---------------- Add Signal ---------------- */

  async function addSignal() {
    if (!form.key || !form.label || !form.categoryKey) {
      alert("Key, Label, and Category are required");
      return;
    }

    const res = await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        key: form.key,
        label: form.label,
        categoryKey: form.categoryKey,

        inputType: form.inputType,
        direction: form.direction,

        unit: form.unit || "",
        target: form.target ? Number(form.target) : null,

        min: form.min ? Number(form.min) : null,
        max: form.max ? Number(form.max) : null,
        step: form.step ? Number(form.step) : null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert("Error: " + JSON.stringify(data.error));
      return;
    }

    /* Reset Form */
    setForm({
      key: "",
      label: "",
      categoryKey: "",
      inputType: "number",

      direction: "higher_better",

      unit: "",
      target: "",

      min: "",
      max: "",
      step: "",
    });

    loadAll();
  }

  /* ---------------- Delete Signal ---------------- */

  async function removeSignal(key: string) {
    await fetch(`/api/signals?key=${key}`, { method: "DELETE" });
    loadAll();
  }

  /* ---------------- UI ---------------- */

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-4xl mx-auto p-6 space-y-10">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Life Signals</h1>

          <p className="text-sm text-gray-400 max-w-2xl">
            Signals are dynamic daily inputs: stress sliders, meditation
            checkboxes, water intake numbers, journaling fields, etc. These feed
            into metrics like Energy, Discipline, Recovery, and Load.
          </p>
        </div>

        {/* Create Signal */}
        <Card title="Create Signal" subtitle="Add a new daily field">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Key */}
            <InputField
              label="Key"
              description="internal id (meditation, water, stress)"
              value={form.key}
              onChange={(v) => setForm({ ...form, key: v })}
            />

            {/* Label */}
            <InputField
              label="Label"
              description="shown in UI (Meditation)"
              value={form.label}
              onChange={(v) => setForm({ ...form, label: v })}
            />

            {/* Category */}
            <SelectField
              label="Category"
              value={form.categoryKey}
              options={categories.map((c) => ({
                value: c.key,
                label: c.label,
              }))}
              onChange={(v) => setForm({ ...form, categoryKey: v })}
            />

            {/* Input Type */}
            <SelectField
              label="Input Type"
              value={form.inputType}
              options={[
                { value: "checkbox", label: "Checkbox (Yes/No)" },
                { value: "number", label: "Number Input" },
                { value: "slider", label: "Slider (Scale)" },
                { value: "text", label: "Text Field" },
                { value: "textarea", label: "Journal / Long Text" },
              ]}
              onChange={(v) =>
                setForm({ ...form, inputType: v as InputType })
              }
            />

            {/* Direction */}
            <SelectField
              label="Direction"
              value={form.direction}
              options={[
                {
                  value: "higher_better",
                  label: "Higher is Better (water, work, steps)",
                },
                {
                  value: "lower_better",
                  label: "Lower is Better (stress, anxiety, junk food)",
                },
              ]}
              onChange={(v) =>
                setForm({ ...form, direction: v as Direction })
              }
            />
          </div>

          {/* Number Config */}
          {form.inputType === "number" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
              <InputField
                label="Unit (optional)"
                description="L, hrs, mins"
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v })}
              />

              <InputField
                label="Target (optional)"
                description="daily goal"
                type="number"
                value={form.target}
                onChange={(v) => setForm({ ...form, target: v })}
              />
            </div>
          )}

          {/* Slider Config */}
          {form.inputType === "slider" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
              <InputField
                label="Min"
                type="number"
                value={form.min}
                onChange={(v) => setForm({ ...form, min: v })}
              />

              <InputField
                label="Max"
                type="number"
                value={form.max}
                onChange={(v) => setForm({ ...form, max: v })}
              />

              <InputField
                label="Step"
                type="number"
                value={form.step}
                onChange={(v) => setForm({ ...form, step: v })}
              />
            </div>
          )}

          {/* Submit */}
          <button
            onClick={addSignal}
            className="mt-6 px-5 py-2 rounded-lg bg-white text-black font-semibold active:scale-[0.98] transition"
          >
            + Add Signal
          </button>
        </Card>

        {/* Existing Signals */}
        <Card title="Your Signals" subtitle="Active daily fields">
          {signals.length === 0 && (
            <div className="text-sm text-gray-500">
              No signals yet. Create your first one above.
            </div>
          )}

          <div className="space-y-3">
            {signals.map((s) => (
              <div
                key={s.key}
                className="flex justify-between items-center bg-[#0f1115] border border-[#232632] rounded-xl p-3"
              >
                <div>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-gray-500">
                    {s.key} · {s.inputType} · {s.categoryKey} ·{" "}
                    {s.direction}
                  </div>
                </div>

                <button
                  onClick={() => removeSignal(s.key)}
                  className="text-sm text-red-400 hover:text-red-300 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
