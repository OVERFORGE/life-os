"use client";

import { useEffect, useState } from "react";

import { Card } from "@/features/daily-log/ui/Card";
import { InputField } from "@/features/daily-log/ui/InputField";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { SliderField } from "@/features/daily-log/ui/SliderField";
import { TextareaField } from "@/features/daily-log/ui/TextareaField";

type Signal = {
  key: string;
  label: string;
  categoryKey: string;

  inputType: "checkbox" | "number" | "slider" | "text" | "textarea";

  unit?: string;
  target?: number | null;

  min?: number | null;
  max?: number | null;

  dependsOn?: string | null;
  showIf?: number | null;

  isCore?: boolean;
};

export function CategorySignalCard({
  categoryKey,
  title,
  subtitle,
  date,
}: {
  categoryKey: string;
  title: string;
  subtitle?: string;
  date: string;
}) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  /* ===================================================== */
  /* Load Signals + Today's Values                          */
  /* ===================================================== */

  useEffect(() => {
    async function load() {
      /* Load signals */
      const sigRes = await fetch("/api/signals");
      const sigData = await sigRes.json();

      const categorySignals = (sigData.signals || []).filter(
        (s: Signal) =>
          s.categoryKey === categoryKey && !s.isCore
      );

      setSignals(categorySignals);

      /* Load today values */
      const logRes = await fetch("/api/daily-log/today");
      const logData = await logRes.json();

      setValues(logData.signals || {});
    }

    load();
  }, [categoryKey]);

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

  if (!signals.length) return null;

  return (
    <Card title={title} subtitle={subtitle}>
      <div className="space-y-5">
        {signals.map((s) => {
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
                description={
                  s.target
                    ? `Target: ${s.target} ${s.unit || ""}`
                    : s.unit
                    ? `Unit: ${s.unit}`
                    : undefined
                }
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
}
