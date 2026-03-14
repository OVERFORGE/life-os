"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { CheckboxField } from "@/features/daily-log/ui/CheckboxField";
import { TextareaField } from "@/features/daily-log/ui/TextareaField";

type Signal = {
  key: string;
  label: string;
  inputType: "checkbox" | "textarea";
  categoryKey: string;
  isCore?: boolean;
};

export function WorkCardDynamic({ date }: { date: string }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/signals");
      const data = await res.json();

      const workSignals = (data.signals || []).filter(
        (s: Signal) =>
          s.categoryKey === "work" && !s.isCore
      );

      setSignals(workSignals);
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
    <Card title="Work & Execution" subtitle="Configurable work signals">
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
