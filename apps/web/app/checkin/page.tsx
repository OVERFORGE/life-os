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
    <div className="min-h-screen bg-[#161618] text-gray-100 flex flex-col">
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Log</h1>
          <p className="text-sm text-gray-400 mt-1">Check-in for {todayDate}</p>
        </div>
        <div className="w-10 h-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-5xl mx-auto space-y-8 pb-28">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ✅ Core System Signals */}
            <div className="col-span-1 md:col-span-2">
              <CoreCategorySections date={todayDate} />
            </div>

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
            
            <div className="col-span-1 md:col-span-2">
              <ReflectionCard form={form} setForm={setForm} />
            </div>
          </div>

          {/* ✅ Save Button */}
          <div className="pt-6">
            <button
              onClick={save}
              disabled={saving}
              className={`w-full py-4 rounded-2xl flex items-center justify-center text-[15px] font-bold transition-all shadow-sm ${
                saving 
                  ? 'bg-[#2A2B2F] text-gray-500 cursor-not-allowed border border-[#2A2B2F]' 
                  : 'bg-[#E8414A] hover:bg-[#D62C35] border border-[#E8414A] text-white hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              {saving ? "Saving..." : "Save Check-in"}
            </button>

            {status && (
              <div className="text-center text-sm font-bold mt-4 transition-all">
                <span className={status.includes('Error') ? 'text-[#E8414A]' : 'text-green-500'}>
                  {status}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
