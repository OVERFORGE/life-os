"use client";

import { useEffect, useState } from "react";

import { DailyLogForm } from "@/features/daily-log/types";

import { PlanningCard } from "@/features/daily-log/components/PlanningCard";
import { ReflectionCard } from "@/features/daily-log/components/ReflectionCard";

import { CoreCategorySections } from "@/features/schema/ui/CoreCategorySections";
import { CategorySignalCard } from "@/features/schema/ui/CategorySignalCard";

import { getTodayDateString } from "@/utils/date";

/* ---------------- Default Form ---------------- */

const defaultForm: DailyLogForm = {
  planning: {
    plannedTasks: 0,
    completedTasks: 0,
    reasonNotCompleted: "",
  },

  reflection: {
    win: "",
    mistake: "",
    learned: "",
    bothering: "",
  },
};

/* ---------------- Page ---------------- */

export default function CheckinPage() {
  const [form, setForm] = useState<DailyLogForm>(defaultForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const todayDate = getTodayDateString();

  /* ---------------- Load Today's Log ---------------- */

  useEffect(() => {
    fetch("/api/daily-log/today")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setForm((prev) => ({
            ...prev,
            ...data,
          }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  /* ---------------- Save Core Form ---------------- */

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
      <div className="max-w-xl mx-auto p-4 space-y-6 pb-28">
        {/* ✅ Core System Signals */}
        <CoreCategorySections date={todayDate} />

        {/* ✅ Dynamic Category Cards */}
        <CategorySignalCard
          categoryKey="physical"
          title="Physical Health"
          subtitle="Body, movement, food, pain"
          date={todayDate}
        />

        <CategorySignalCard
          categoryKey="habits"
          title="Habits & Discipline"
          subtitle="Daily discipline signals"
          date={todayDate}
        />

        <CategorySignalCard
          categoryKey="work"
          title="Work & Execution"
          subtitle="Deep work + progress"
          date={todayDate}
        />

        {/* Static Cards */}
        <PlanningCard form={form} setForm={setForm} />
        <ReflectionCard form={form} setForm={setForm} />

        {/* ✅ Save Button */}
        <div className="pt-4">
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
