"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Flame,
  Target,
  Sparkles,
  Calendar,
  X,
  Plus,
  Check,
} from "lucide-react";
import { CustomDatePicker } from "@/components/ui/CustomDateTimePicker";

const AVAILABLE_HABIT_SIGNALS = [
  { key: "mental.mood", label: "mood", category: "Mind" },
  { key: "mental.stress", label: "Stress", category: "Mind" },
  { key: "sleep.hours", label: "Sleep Hours", category: "Recovery" },
  { key: "work.deepWorkHours", label: "Deep Work Hours", category: "Cognitive" },
  { key: "mental.anxiety", label: "anxiety", category: "Mind" },
  { key: "intellect.reading", label: "pages read", category: "Cognitive" },
  { key: "learning.machine_learning", label: "Machine Learning Study Time", category: "Cognitive" },
  { key: "learning.product_engineering", label: "Product Engineering Study Time", category: "Cognitive" },
  { key: "learning.devops", label: "DevOps Study Time", category: "Cognitive" },
  { key: "work.coding", label: "Did Coding", category: "Cognitive" },
  { key: "work.execution", label: "Focused Deep Work", category: "Cognitive" },
  { key: "learning.general", label: "Studied / Learning", category: "Cognitive" },
  { key: "intellect.reading_book", label: "Reading", category: "Cognitive" },
  { key: "work.coding_practice", label: "Coding Practice", category: "Cognitive" },
  { key: "work.content_creation", label: "Content Creation", category: "Cognitive" },
  { key: "learning.study", label: "Learning / Study", category: "Cognitive" },
  { key: "wellness.discipline", label: "NoFap", category: "Mind" },
  { key: "health.meals", label: "Meals Eaten", category: "Physical" },
  { key: "health.diet", label: "Diet Note", category: "Physical" },
  { key: "physical.gym", label: "Gym & Workout", category: "Physical" },
  { key: "physical.steps", label: "Daily Steps", category: "Physical" },
];

export default function NewGoalPage() {
  const router = useRouter();

  // Mode: Habit vs Finite Goal
  const [nature, setNature] = useState<"habitual_cadence" | "finite_deliverable">("habitual_cadence");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"identity" | "performance" | "maintenance" | "recovery">("identity");

  // Habit specifics
  const [cadence, setCadence] = useState<"daily" | "weekly" | "flexible">("daily");
  const [signals, setSignals] = useState<{ key: string; label: string; weight: number }[]>([
    { key: "mental.mood", label: "mood", weight: 2 },
  ]);
  const [customSignalKey, setCustomSignalKey] = useState("");

  // Goal specifics
  const [horizon, setHorizon] = useState<"1 Month" | "3 Months" | "6 Months" | "1 Year" | "Custom">("3 Months");
  const [targetDate, setTargetDate] = useState("");
  const [milestones, setMilestones] = useState<string[]>([
    "Initial discovery & scope definition",
    "Prototype delivery & local integration",
    "Validation & stress test deployment",
  ]);
  const [newMilestoneInput, setNewMilestoneInput] = useState("");

  const [creating, setCreating] = useState(false);

  // Dynamic available signals from API
  const [apiSignals, setApiSignals] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/signals")
      .then((r) => r.json())
      .then((d) => {
        if (d.signals && Array.isArray(d.signals)) {
          setApiSignals(d.signals);
        }
      })
      .catch((e) => console.error("Error loading signals:", e));
  }, []);

  // Combined signal options
  const signalOptions = React.useMemo(() => {
    const list = [...AVAILABLE_HABIT_SIGNALS];
    apiSignals.forEach((as) => {
      if (!list.some((item) => item.key === as.key)) {
        list.push({ key: as.key, label: as.label || as.key, category: "Custom" });
      }
    });
    return list;
  }, [apiSignals]);

  const handleCreate = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);

    try {
      const backendType = type === "recovery" ? "maintenance" : type;
      let payload: any = {
        title: title.trim(),
        nature,
        type: backendType,
        status: "active",
      };

      if (nature === "habitual_cadence") {
        payload.cadence = cadence;
        payload.signals = signals.map((s) => ({
          key: s.key,
          weight: s.weight || 2,
          direction: "higher_better",
        }));
      } else {
        payload.horizon = horizon;
        payload.targetCompletionDate = targetDate || undefined;
        payload.milestones = milestones
          .filter((m) => m.trim().length > 0)
          .map((title, i) => ({
            milestoneId: `ms_${Date.now()}_${i}`,
            title: title.trim(),
            completed: i === 0,
            order: i,
          }));
      }

      const res = await fetch("/api/goals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.id) {
        router.push(`/goals/${data.id}`);
      } else {
        router.push("/trajectory");
      }
    } catch (e) {
      console.error("[NewGoalPage] Create error:", e);
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 h-full w-full overflow-y-auto bg-[#111113] text-[#F7F5F0] custom-h-scrollbar">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#23242A]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] border border-[#23242A] text-[#85827A] hover:text-[#F7F5F0] transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#F7F5F0]">
                {nature === "habitual_cadence" ? "New Supporting Habit" : "New Strategic Goal"}
              </h1>
              <p className="text-xs text-[#85827A]">
                {nature === "habitual_cadence"
                  ? "Continuous 14-day rolling cadence driven by weighted signals."
                  : "Finite milestone deliverable anchored to a target completion horizon."}
              </p>
            </div>
          </div>
        </div>

        {/* Format Switcher (Custom Segmented Control) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            Trajectory Architecture Format
          </label>
          <div className="grid grid-cols-2 gap-2 bg-[#17171A] p-1 rounded-2xl border border-[#23242A]">
            <button
              type="button"
              onClick={() => setNature("habitual_cadence")}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-mono transition-all cursor-pointer border ${
                nature === "habitual_cadence"
                  ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                  : "bg-transparent border-transparent text-[#85827A] hover:text-[#C5C2BA]"
              }`}
            >
              <Flame size={15} />
              <span>Habit (14-Day Rolling Cadence)</span>
            </button>
            <button
              type="button"
              onClick={() => setNature("finite_deliverable")}
              className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-mono transition-all cursor-pointer border ${
                nature === "finite_deliverable"
                  ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                  : "bg-transparent border-transparent text-[#85827A] hover:text-[#C5C2BA]"
              }`}
            >
              <Target size={15} />
              <span>Goal (Finite Milestone Deliverable)</span>
            </button>
          </div>
        </div>

        {/* Title Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            {nature === "habitual_cadence" ? "Habit Title" : "Goal Title"}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              nature === "habitual_cadence"
                ? "e.g. Master React Native or Daily Deep Work Block"
                : "e.g. Distributed Core Engine & Cache Pipeline"
            }
            className="w-full bg-[#17171A] border border-[#23242A] rounded-2xl p-4 text-sm font-semibold text-[#F7F5F0] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors"
          />
        </div>

        {/* Goal Type Custom Pills (Matches Screenshot!) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            Goal Type
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(["identity", "performance", "maintenance", "recovery"] as const).map((t) => {
              const isSelected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-2.5 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer border text-center ${
                    isSelected
                      ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                      : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA] hover:bg-[#1E1F24]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* HABIT SPECIFIC FIELDS */}
        {nature === "habitual_cadence" && (
          <>
            {/* Cadence Pills */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
                Cadence Frequency
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["daily", "weekly", "flexible"] as const).map((c) => {
                  const isSelected = cadence === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
                      className={`py-2.5 rounded-xl text-xs font-mono capitalize transition-all cursor-pointer border text-center ${
                        isSelected
                          ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                          : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA]"
                      }`}
                    >
                      {c === "daily" ? "Daily (7d/wk)" : c === "weekly" ? "Weekly (1–3d/wk)" : "Flexible"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tracked Signals Section (Matches Screenshot!) */}
            <div className="p-5 rounded-2xl bg-[#17171A] border border-[#23242A] flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-[#23242A]">
                <div>
                  <h3 className="text-xs font-bold text-[#F7F5F0] uppercase tracking-wider font-mono">
                    Tracked Signals
                  </h3>
                  <span className="text-[11px] text-[#85827A]">
                    Select signals that feed this habit's rolling momentum score
                  </span>
                </div>
                <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-[#111113] text-[#ffb86c] border border-[#23242A]">
                  {signals.length} Selected
                </span>
              </div>

              {/* SELECT SIGNAL CHIPS */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A] block mb-2">
                  SELECT SIGNAL
                </span>
                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto custom-h-scrollbar pr-1">
                  {signalOptions.map((sig) => {
                    const isSelected = signals.some((s) => s.key === sig.key);
                    return (
                      <button
                        key={sig.key}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSignals(signals.filter((s) => s.key !== sig.key));
                          } else {
                            setSignals([...signals, { key: sig.key, label: sig.label, weight: 2 }]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer font-medium ${
                          isSelected
                            ? "bg-[#ffb86c]/20 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                            : "bg-[#111113] border-[#23242A] text-[#C5C2BA] hover:text-[#F7F5F0] hover:border-[#32343D]"
                        }`}
                      >
                        {sig.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Key Add Row */}
              <div className="flex gap-2 pt-2 border-t border-[#23242A]">
                <input
                  type="text"
                  value={customSignalKey}
                  onChange={(e) => setCustomSignalKey(e.target.value)}
                  placeholder="Custom key: e.g. reading.pages"
                  className="flex-1 bg-[#111113] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] font-mono outline-none focus:border-[#ffb86c]/60"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customSignalKey.trim()) {
                      e.preventDefault();
                      if (!signals.some((s) => s.key === customSignalKey.trim())) {
                        setSignals([
                          ...signals,
                          { key: customSignalKey.trim(), label: customSignalKey.trim(), weight: 2 },
                        ]);
                      }
                      setCustomSignalKey("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customSignalKey.trim()) {
                      if (!signals.some((s) => s.key === customSignalKey.trim())) {
                        setSignals([
                          ...signals,
                          { key: customSignalKey.trim(), label: customSignalKey.trim(), weight: 2 },
                        ]);
                      }
                      setCustomSignalKey("");
                    }
                  }}
                  disabled={!customSignalKey.trim()}
                  className="px-4 py-2 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#F7F5F0] border border-[#23242A] disabled:opacity-40 transition cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Active Signal Weights List */}
              {signals.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#23242A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#85827A] block">
                    Active Signal Weights
                  </span>
                  <div className="space-y-2">
                    {signals.map((s, idx) => (
                      <div
                        key={s.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#111113] border border-[#23242A] text-xs"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-[#F7F5F0] font-medium">{s.label}</span>
                          <span className="text-[10px] font-mono text-[#85827A]">{s.key}</span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Weight Stepper */}
                          <div className="flex items-center gap-1.5 bg-[#17171A] border border-[#23242A] rounded-lg px-2.5 py-1">
                            <span className="text-[9px] font-mono text-[#85827A]">WT</span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...signals];
                                next[idx].weight = Math.max(1, (next[idx].weight || 2) - 1);
                                setSignals(next);
                              }}
                              className="w-5 h-5 rounded hover:bg-[#23242A] text-[#F7F5F0] font-bold text-xs flex items-center justify-center cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold font-mono text-[#ffb86c] text-xs">
                              {s.weight || 2}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...signals];
                                next[idx].weight = Math.min(10, (next[idx].weight || 2) + 1);
                                setSignals(next);
                              }}
                              className="w-5 h-5 rounded hover:bg-[#23242A] text-[#F7F5F0] font-bold text-xs flex items-center justify-center cursor-pointer"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSignals(signals.filter((_, i) => i !== idx))}
                            className="p-1 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* GOAL SPECIFIC FIELDS */}
        {nature === "finite_deliverable" && (
          <>
            {/* Horizon Pills */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
                Time Horizon
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(["1 Month", "3 Months", "6 Months", "1 Year", "Custom"] as const).map((h) => {
                  const isSelected = horizon === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setHorizon(h);
                        const d = new Date();
                        if (h === "1 Month") d.setMonth(d.getMonth() + 1);
                        else if (h === "3 Months") d.setMonth(d.getMonth() + 3);
                        else if (h === "6 Months") d.setMonth(d.getMonth() + 6);
                        else if (h === "1 Year") d.setFullYear(d.getFullYear() + 1);
                        setTargetDate(d.toISOString().slice(0, 10));
                      }}
                      className={`py-2 rounded-xl text-xs font-mono transition-all cursor-pointer border text-center ${
                        isSelected
                          ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                          : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:text-[#C5C2BA]"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Date Picker */}
            <div className="flex flex-col gap-1.5">
              <CustomDatePicker
                label="Target Completion Date"
                value={targetDate}
                onChange={(val) => setTargetDate(val)}
              />
            </div>

            {/* Milestones Builder */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
                Milestones ({milestones.length})
              </label>
              <div className="flex flex-col gap-2">
                {milestones.map((ms, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#17171A] border border-[#23242A] text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span className="w-5 h-5 rounded-lg bg-[#111113] border border-[#23242A] flex items-center justify-center font-mono text-[10px] text-[#ffb86c] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-[#F7F5F0] truncate">{ms}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMilestones(milestones.filter((_, i) => i !== idx))}
                      className="text-[#85827A] hover:text-rose-400 p-1 transition cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newMilestoneInput}
                    onChange={(e) => setNewMilestoneInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMilestoneInput.trim()) {
                        e.preventDefault();
                        setMilestones([...milestones, newMilestoneInput.trim()]);
                        setNewMilestoneInput("");
                      }
                    }}
                    placeholder="Add a milestone and press enter..."
                    className="flex-1 bg-[#17171A] border border-[#23242A] rounded-xl px-3 py-2 text-xs text-[#F7F5F0] outline-none focus:border-[#ffb86c]/60"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newMilestoneInput.trim()) {
                        setMilestones([...milestones, newMilestoneInput.trim()]);
                        setNewMilestoneInput("");
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#F7F5F0] border border-[#23242A] transition cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Submit Action */}
        <div className="pt-4 border-t border-[#23242A] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#85827A] hover:text-[#F7F5F0] transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !title.trim() || (nature === "habitual_cadence" && signals.length === 0)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] text-xs font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            {creating ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[#492900] border-t-transparent animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>{nature === "habitual_cadence" ? "Create Habit" : "Create Goal"}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
