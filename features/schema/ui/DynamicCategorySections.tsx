"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { InputField } from "@/features/daily-log/ui/InputField";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { SliderField } from "@/features/daily-log/ui/SliderField";
import { TextareaField } from "@/features/daily-log/ui/TextareaField";

type Category = {
  key: string;
  label: string;
};

type Signal = {
  key: string;
  label: string;
  categoryKey: string;

  inputType: "checkbox" | "number" | "slider" | "text" | "textarea";

  unit?: string;
  target?: number | null;

  min?: number | null;
  max?: number | null;
  step?: number | null;
};

export function DynamicCategorySections({ date }: { date: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  /* ---------------- Load Schema ---------------- */

  useEffect(() => {
    async function loadSchema() {
      const catRes = await fetch("/api/categories");
      const catData = await catRes.json();
      setCategories(catData.categories || []);

      const sigRes = await fetch("/api/signals");
      const sigData = await sigRes.json();
      setSignals(sigData.signals || []);
    }

    loadSchema();
  }, []);

  /* ---------------- Save Signal Value ---------------- */

  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({ ...prev, [key]: value }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-8 pt-8">
      <h2 className="text-xl font-semibold">Custom Signals</h2>

      {categories.map((cat) => {
        const catSignals = signals.filter(
          (s) => s.categoryKey === cat.key
        );

        if (!catSignals.length) return null;

        return (
          <Card
            key={cat.key}
            title={cat.label}
            subtitle="Dynamic daily fields"
          >
            <div className="space-y-5">
              {catSignals.map((s) => {
                const current = values[s.key];

                /* -------- Checkbox -------- */
                if (s.inputType === "checkbox") {
                  return (
                    <CheckboxField
                      key={s.key}
                      label={s.label}
                      checked={current === 1}
                      onChange={(v) => updateSignal(s.key, v ? 1 : 0)}
                    />
                  );
                }

                /* -------- Number -------- */
                if (s.inputType === "number") {
                  return (
                    <InputField
                      key={s.key}
                      label={s.label}
                      description={
                        s.target
                          ? `Target: ${s.target} ${s.unit || ""}`
                          : s.unit
                          ? `Unit: ${s.unit}`
                          : undefined
                      }
                      type="number"
                      value={current ?? ""}
                      onChange={(v) => updateSignal(s.key, Number(v))}
                    />
                  );
                }

                /* -------- Slider -------- */
                if (s.inputType === "slider") {
                  return (
                    <SliderField
                      key={s.key}
                      label={s.label}
                      leftLabel={`${s.min ?? 0}`}
                      rightLabel={`${s.max ?? 10}`}
                      value={current ?? s.min ?? 0}
                      onChange={(v) => updateSignal(s.key, v)}
                    />
                  );
                }

                /* -------- Text -------- */
                if (s.inputType === "text") {
                  return (
                    <InputField
                      key={s.key}
                      label={s.label}
                      value={current ?? ""}
                      onChange={(v) => updateSignal(s.key, v)}
                    />
                  );
                }

                /* -------- Textarea -------- */
                if (s.inputType === "textarea") {
                  return (
                    <TextareaField
                      key={s.key}
                      label={s.label}
                      value={current ?? ""}
                      onChange={(v) => updateSignal(s.key, v)}
                    />
                  );
                }

                return null;
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
