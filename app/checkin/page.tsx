"use client";

import { useEffect, useState } from "react";
import { DailyLogForm } from "@/features/daily-log/types";
import { MentalCard } from "@/features/daily-log/components/MentalCard";
import { SleepCard } from "@/features/daily-log/components/SleepCard";
import { PhysicalCard } from "@/features/daily-log/components/PhysicalCard";
import { HabitsCard } from "@/features/daily-log/components/HabitsCard";
import { WorkCard } from "@/features/daily-log/components/WorkCard";
import { PlanningCard } from "@/features/daily-log/components/PlanningCard";
import { ReflectionCard } from "@/features/daily-log/components/ReflectionCard";




const defaultForm: DailyLogForm = {
  mental: { mood: 5, energy: 5, stress: 5, anxiety: 5, focus: 5 },
  sleep: { hours: 0, quality: 5, sleepTime: "", wakeTime: "" },
  physical: {
    gym: false,
    workoutType: "rest",
    calories: 0,
    meals: 0,
    dietNote: "",
    steps: 0,
    bodyFeeling: "normal",
    painNote: "",
  },
  work: {
    deepWorkHours: 0,
    coded: false,
    executioners: false,
    studied: false,
    mainWork: "",
  },
  habits: {
    gym: false,
    reading: false,
    meditation: false,
    coding: false,
    content: false,
    learning: false,
    noFap: true,
    junkFood: { had: false, times: 0, what: "" },
    socialMediaOveruse: false,
  },
  planning: { plannedTasks: 0, completedTasks: 0, reasonNotCompleted: "" },
  reflection: { win: "", mistake: "", learned: "", bothering: "" },
};

export default function CheckinPage() {
  const [form, setForm] = useState<DailyLogForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/daily-log/today")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setForm((prev) => ({ ...prev, ...data }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setStatus("");

    const res = await fetch("/api/daily-log/today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) setStatus("Saved ✅");
    else setStatus("Error saving ❌");

    setSaving(false);
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
  <div className="min-h-screen bg-[#0f1115] text-gray-100">
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-24">
      <MentalCard form={form} setForm={setForm} />
      <SleepCard form={form} setForm={setForm} />
      <PhysicalCard form={form} setForm={setForm} />
      <WorkCard form={form} setForm={setForm} />
      <HabitsCard form={form} setForm={setForm} />
      <PlanningCard form={form} setForm={setForm} />
      <ReflectionCard form={form} setForm={setForm} />

      {/* Save Button */}
      <div className="pt-6">
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-white text-black py-3 rounded-xl font-semibold active:scale-[0.98] transition"
        >
          {saving ? "Saving..." : "Save Check-in"}
        </button>

        {status && (
          <div className="text-center text-sm text-gray-400 mt-2">
            {status}
          </div>
        )}
      </div>
    </div>
  </div>
);

}



