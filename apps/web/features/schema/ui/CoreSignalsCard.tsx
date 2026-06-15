"use client";

import { useState } from "react";
import { Card } from "@/features/daily-log/ui/Card";
import { SliderField } from "@/features/daily-log/ui/SliderField";
import { InputField } from "@/features/daily-log/ui/InputField";
import { TimeSelectField } from "./TimeSelectField";

/* ---------------- Labels ---------------- */

const moodLabels = ["Very Bad", "Bad", "Okay", "Good", "Amazing"];
const energyLabels = ["Exhausted", "Low", "Normal", "High", "Peak"];
const stressLabels = ["Calm", "Mild", "Moderate", "High", "Overloaded"];

function labelFromValue(v: number, labels: string[]) {
  const idx = Math.min(labels.length - 1, Math.floor((v - 1) / 2));
  return labels[idx];
}

/* ---------------- Sleep Hours Calculator ---------------- */

function computeSleepHours(bed: string, wake: string) {
  if (!bed || !wake) return 0;

  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);

  let bedMinutes = bh * 60 + bm;
  let wakeMinutes = wh * 60 + wm;

  // If wake is next day
  if (wakeMinutes <= bedMinutes) {
    wakeMinutes += 24 * 60;
  }

  const diff = (wakeMinutes - bedMinutes) / 60;
  return Math.round(diff * 10) / 10;
}

/* ---------------- Component ---------------- */

export function CoreSignalsCard({ date }: { date: string }) {
  const [values, setValues] = useState<Record<string, any>>({
    mood: 5,
    energy: 5,
    stress: 5,
    sleepTime: "",
    wakeTime: "",
    deepWorkHours: "",
  });

  async function updateSignal(key: string, value: any) {
    setValues((prev) => ({ ...prev, [key]: value }));

    await fetch("/api/signals/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, key, value }),
    });
  }

  /* ---------------- Sleep Sync ---------------- */

  const sleepHours = computeSleepHours(values.sleepTime, values.wakeTime);

  async function updateSleepTimes(bed: string, wake: string) {
    const hours = computeSleepHours(bed, wake);

    setValues((prev) => ({
      ...prev,
      sleepTime: bed,
      wakeTime: wake,
    }));

    // Save both times
    await updateSignal("sleepTime", bed);
    await updateSignal("wakeTime", wake);

    // Save computed hours as core signal
    await updateSignal("sleepHours", hours);
  }

  return (
    <Card
      title="Core Check-in"
      subtitle="The 5 signals that drive your life phase"
    >
      <div className="space-y-7">
        {/* Mood */}
        <SliderField
          label={`Mood — ${labelFromValue(values.mood, moodLabels)}`}
          leftLabel="1"
          rightLabel="10"
          value={values.mood}
          onChange={(v) => updateSignal("mood", v)}
        />

        {/* Energy */}
        <SliderField
          label={`Energy — ${labelFromValue(values.energy, energyLabels)}`}
          leftLabel="1"
          rightLabel="10"
          value={values.energy}
          onChange={(v) => updateSignal("energy", v)}
        />

        {/* Stress */}
        <SliderField
          label={`Stress — ${labelFromValue(values.stress, stressLabels)}`}
          leftLabel="1"
          rightLabel="10"
          value={values.stress}
          onChange={(v) => updateSignal("stress", v)}
        />

        {/* Sleep Section */}
        <div className="pt-2 space-y-3">
          <div className="text-sm font-semibold text-gray-300">
            Sleep Timing
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeSelectField
              label="Bedtime"
              value={values.sleepTime}
              onChange={(v) =>
                updateSleepTimes(v, values.wakeTime)
              }
            />

            <TimeSelectField
              label="Wake Time"
              value={values.wakeTime}
              onChange={(v) =>
                updateSleepTimes(values.sleepTime, v)
              }
            />
          </div>

          <InputField
            label="Sleep Hours (auto)"
            type="number"
            value={sleepHours}
            onChange={() => {}}
          />
        </div>

        {/* Deep Work */}
        <InputField
          label="Deep Work Hours"
          description="Focused work time"
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
