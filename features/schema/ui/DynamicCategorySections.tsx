"use client";

import { useEffect, useState } from "react";

import { Card } from "@/features/daily-log/ui/Card";
import { InputField } from "@/features/daily-log/ui/InputField";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { SliderField } from "@/features/daily-log/ui/SliderField";
import { TextareaField } from "@/features/daily-log/ui/TextareaField";

/* ---------------- Types ---------------- */

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

  isCore?: boolean;

  /* ✅ Dependency Fields */
  dependsOn?: string | null;
  showIf?: number | null;
};

/* ---------------- Component ---------------- */

export function DynamicCategorySections({ date }: { date: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  /* ===================================================== */
  /* Load Schema + Today's Saved Signal Values              */
  /* ===================================================== */

  useEffect(() => {
    async function loadAll() {
      /* Categories */
      const catRes = await fetch("/api/categories");
      const catData = await catRes.json();
      setCategories(catData.categories || []);

      /* Signals */
      const sigRes = await fetch("/api/signals");
      const sigData = await sigRes.json();

      /* Only NON-core signals here */
      const nonCore = (sigData.signals || []).filter(
        (s: Signal) => !s.isCore
      );

      setSignals(nonCore);

      /* ✅ Load today's saved signal values */
      const logRes = await fetch("/api/daily-log/today");
      const logData = await logRes.json();

      setValues(logData.signals || {});
    }

    loadAll();
  }, []);

  /* ===================================================== */
  /* Save Signal Value                                     */
  /* ===================================================== */

  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({ ...prev, [key]: value }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  /* ===================================================== */
  /* UI                                                    */
  /* ===================================================== */

  return (
    <div className="space-y-8 pt-8">
      {categories.map((cat) => {
        const catSignals = signals.filter(
          (s) => s.categoryKey === cat.key
        );

        if (!catSignals.length) return null;

        return (
          <Card key={cat.key} title={cat.label} subtitle="Custom daily fields">
            <div className="space-y-5">
              {catSignals.map((s) => {
                /* ✅ Dependency Logic */
                if (s.dependsOn) {
                  const parentValue = values[s.dependsOn];
                  const requiredValue = s.showIf ?? 1;

                  if (Number(parentValue) !== Number(requiredValue)) {
                    return null;
                  }
                }

                const current = values[s.key];

                /* Checkbox */
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

                /* Number */
                if (s.inputType === "number") {
                  return (
                    <InputField
                      key={s.key}
                      label={s.label}
                      type="number"
                      value={current ?? ""}
                      onChange={(v) => updateSignal(s.key, Number(v))}
                    />
                  );
                }

                /* Slider */
                if (s.inputType === "slider") {
                  return (
                    <SliderField
                      key={s.key}
                      label={s.label}
                      leftLabel={`${s.min ?? 1}`}
                      rightLabel={`${s.max ?? 10}`}
                      value={current ?? s.min ?? 1}
                      onChange={(v) => updateSignal(s.key, v)}
                    />
                  );
                }

                /* Text */
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

                /* Textarea */
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
