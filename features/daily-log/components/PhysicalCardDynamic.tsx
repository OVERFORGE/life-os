"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { InputField } from "@/features/daily-log/ui/InputField";
import { TextareaField } from "@/features/daily-log/ui/TextareaField";

type Signal = {
  key: string;
  label: string;
  categoryKey: string;
  inputType: "checkbox" | "number" | "textarea";
  unit?: string;
  target?: number | null;
};

export function PhysicalCardDynamic({ date }: { date: string }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/signals");
      const data = await res.json();

      const physicalSignals = (data.signals || []).filter(
        (s: Signal) => s.categoryKey === "physical"
      );

      setSignals(physicalSignals);
    }

    load();
  }, []);

  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({ ...prev, [key]: value }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  if (!signals.length) return null;

  return (
    <Card title="Physical Health" subtitle="Customizable body tracking">
      <div className="space-y-5">
        {signals.map((s) => {
          const current = values[s.key];

          if (s.inputType === "checkbox") {
            return (
              <CheckboxField
                key={s.key}
                label={s.label}
                checked={current === 1}
                onChange={(v) =>
                  updateSignal(s.key, v ? 1 : 0)
                }
              />
            );
          }

          if (s.inputType === "number") {
            return (
              <InputField
                key={s.key}
                label={s.label}
                description={
                  s.target
                    ? `Target: ${s.target} ${s.unit}`
                    : s.unit
                    ? `Unit: ${s.unit}`
                    : undefined
                }
                type="number"
                value={current ?? ""}
                onChange={(v) =>
                  updateSignal(s.key, Number(v))
                }
              />
            );
          }

          if (s.inputType === "textarea") {
            return (
              <TextareaField
                key={s.key}
                label={s.label}
                value={current ?? ""}
                onChange={(v) =>
                  updateSignal(s.key, v)
                }
              />
            );
          }

          return null;
        })}
      </div>
    </Card>
  );
}
