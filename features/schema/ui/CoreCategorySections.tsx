"use client";

import { useEffect, useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { SliderField } from "@/features/daily-log/ui/SliderField";
import { InputField } from "@/features/daily-log/ui/InputField";
import { TimePickerField } from "@/features/daily-log/ui/TimePickerField";

function moodLabel(v: number) {
  if (v <= 2) return "Very Bad";
  if (v <= 4) return "Bad";
  if (v <= 6) return "Okay";
  if (v <= 8) return "Good";
  return "Amazing";
}

function stressLabel(v: number) {
  if (v <= 2) return "Calm";
  if (v <= 4) return "Low Stress";
  if (v <= 6) return "Moderate";
  if (v <= 8) return "High Stress";
  return "Overloaded";
}

export function CoreCategorySections({ date }: { date: string }) {
  const [values, setValues] = useState<Record<string, any>>({
    mood: 5,
    energy: 5,
    stress: 5,
    deepWorkHours: 0,
    sleepHours: 0,
    sleepTime: "",
    wakeTime: "",
  });

  /* Load today's saved signals */
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/daily-log/today");
      const data = await res.json();

      if (data?.signals) {
        setValues((prev) => ({
          ...prev,
          ...data.signals,
        }));
      }
    }

    load();
  }, []);

  /* Save helper */
  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({ ...prev, [key]: value }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  /* Sleep calculation */
  function calculateSleepHours(bed: string, wake: string) {
    if (!bed || !wake) return 0;

    const bedTime = new Date(`2000-01-01T${bed}`);
    let wakeTime = new Date(`2000-01-01T${wake}`);

    if (wakeTime < bedTime) {
      wakeTime.setDate(wakeTime.getDate() + 1);
    }

    const diff = (wakeTime.getTime() - bedTime.getTime()) / 3600000;
    return Math.round(diff * 10) / 10;
  }

  return (
    <Card title="Core Check-in" subtitle="System signals for today">
      <div className="space-y-6">
        {/* Mood */}
        <SliderField
          label={`Mood — ${moodLabel(values.mood)}`}
          leftLabel="Bad"
          rightLabel="Great"
          value={values.mood}
          onChange={(v) => updateSignal("mood", v)}
        />

        {/* Energy */}
        <SliderField
          label={`Energy — ${values.energy}/10`}
          leftLabel="Low"
          rightLabel="High"
          value={values.energy}
          onChange={(v) => updateSignal("energy", v)}
        />

        {/* Stress */}
        <SliderField
          label={`Stress — ${stressLabel(values.stress)}`}
          leftLabel="Calm"
          rightLabel="Overload"
          value={values.stress}
          onChange={(v) => updateSignal("stress", v)}
        />

        {/* Sleep Picker */}
        <div className="grid grid-cols-2 gap-4">
          <TimePickerField
            label="Bedtime"
            value={values.sleepTime}
            onChange={(v) => {
                updateSignal("sleepTime", v);
                const hrs = calculateSleepHours(v, values.wakeTime);
                updateSignal("sleepHours", hrs);
            }}
            />

            <TimePickerField
            label="Wake Time"
            value={values.wakeTime}
            onChange={(v) => {
                updateSignal("wakeTime", v);
                const hrs = calculateSleepHours(values.sleepTime, v);
                updateSignal("sleepHours", hrs);
            }}
            />


          
        </div>

        {/* Sleep Hours Display */}
        <InputField
          label="Sleep Duration"
          type="number"
          value={values.sleepHours}
          onChange={(v) => updateSignal("sleepHours", Number(v))}
        />

        {/* Deep Work */}
        <InputField
          label="Deep Work Hours"
          type="number"
          value={values.deepWorkHours}
          onChange={(v) =>
            updateSignal("deepWorkHours", Number(v))
          }
        />
      </div>
    </Card>
  );
}
