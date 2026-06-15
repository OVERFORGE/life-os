"use client";

import { useEffect, useState } from "react";

import { Card } from "@/features/daily-log/ui/Card";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { InputField } from "@/features/daily-log/ui/InputField";

type Signal = {
  key: string;
  label: string;
  categoryKey: string;

  inputType: "checkbox" | "number" | "text";

  dependsOn?: string | null;
  showIf?: number | string | null;
};

export function HabitsCardDynamic({ date }: { date: string }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  /* ---------------- Load Habit Signals ---------------- */

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/signals");
      const data = await res.json();

      const habitSignals = (data.signals || []).filter(
        (s: Signal) => s.categoryKey === "habits"
      );

      setSignals(habitSignals);
    }

    load();
  }, []);

  /* ---------------- Save Signal Value ---------------- */

  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  /* ---------------- UI ---------------- */

  if (!signals.length) return null;

  return (
    <Card title="Habits & Discipline" subtitle="Daily discipline habits">
      <div className="space-y-4">
        {signals.map((s) => {
          const current = values[s.key];

          /* ✅ Dependency Rule (Fixed) */
          if (s.dependsOn) {
            const parentVal = Number(values[s.dependsOn]);
            const required = Number(s.showIf);

            if (parentVal !== required) {
              return null;
            }
          }

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

          return null;
        })}
      </div>
    </Card>
  );
}
