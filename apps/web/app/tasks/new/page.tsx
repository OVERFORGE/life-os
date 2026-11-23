"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Timer,
  X,
  Plus,
  Check,
  Zap,
  Target,
  Repeat,
  ListTodo,
} from "lucide-react";
import { CustomDatePicker, CustomTimePicker } from "@/components/ui/CustomDateTimePicker";

const PRIORITIES = [
  { key: "low", label: "Low", activeClass: "border-[#C5C2BA]/50 text-[#C5C2BA] bg-[#22242B]" },
  { key: "medium", label: "Medium", activeClass: "border-[#ffb86c] text-[#ffb86c] bg-[#ffb86c]/15" },
  { key: "high", label: "High", activeClass: "border-rose-500/80 text-rose-400 bg-rose-500/15" },
];

const DURATION_PRESETS = [
  { label: "15m", val: "15" },
  { label: "30m", val: "30" },
  { label: "45m", val: "45" },
  { label: "60m", val: "60" },
  { label: "90m", val: "90" },
  { label: "2h", val: "120" },
];

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dueTime, setDueTime] = useState<string>("");

  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [recurringType, setRecurringType] = useState<"none" | "daily" | "weekly" | "custom">("none");
  const [recurringInterval, setRecurringInterval] = useState("1");
  const [goalId, setGoalId] = useState<string | null>(null);

  const [energyCost, setEnergyCost] = useState(5);
  const [estimatedDuration, setEstimatedDuration] = useState("30");

  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch("/api/goals/list");
      if (res.ok) setGoals(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, newSubtask.trim()]);
    setNewSubtask("");
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    let recurring = null;
    if (recurringType !== "none") {
      recurring = {
        type: recurringType,
        interval: recurringType === "custom" ? parseInt(recurringInterval, 10) || 1 : 1,
      };
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate,
      dueTime: dueTime ? dueTime : null,
      priority,
      recurring,
      goalId,
      metadata: {
        energyCost,
        estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : null,
      },
      subtasks: subtasks.map((t) => ({ title: t, done: false })),
    };
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/tasks");
      } else {
        alert("Failed to create task.");
      }
    } catch (e) {
      alert("Network error creating task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111113] text-[#F7F5F0] flex flex-col justify-start items-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl flex flex-col gap-6 pb-24">
        {/* Header with Back Navigation */}
        <div className="flex items-center justify-between border-b border-[#23242A] pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-9 h-9 rounded-xl bg-[#17171A] border border-[#23242A] flex items-center justify-center text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#1E1F24] transition cursor-pointer"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#85827A]">
                Tasks / Creation
              </div>
              <h1 className="text-xl font-bold font-mono tracking-tight text-[#F7F5F0]">
                New Task
              </h1>
            </div>
          </div>
        </div>

        {/* SECTION: WHAT NEEDS TO BE DONE? */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            What needs to be done?
          </label>
          <div className="space-y-2.5">
            <input
              type="text"
              required
              autoFocus
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#17171A] border border-[#23242A] rounded-2xl p-4 text-sm font-semibold text-[#F7F5F0] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors"
            />
            <textarea
              placeholder="Add context or notes... (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#17171A] border border-[#23242A] rounded-2xl p-4 text-xs text-[#C5C2BA] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors min-h-[90px] resize-none"
            />
          </div>
        </div>

        {/* SECTION: SCHEDULE (CUSTOM PRETTY UI) */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            Schedule
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CustomDatePicker
              label="Due Date"
              value={dueDate}
              onChange={(val) => setDueDate(val)}
            />
            <CustomTimePicker
              label="Target Time"
              value={dueTime}
              onChange={(val) => setDueTime(val)}
            />
          </div>
        </div>

        {/* SECTION: PRIORITY */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70">
            Priority
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key as any)}
                  className={`py-3 rounded-xl border text-xs font-mono transition-all text-center cursor-pointer ${
                    isSelected
                      ? `${p.activeClass} font-bold shadow-sm`
                      : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:bg-[#1E1F24] hover:text-[#C5C2BA]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION: SUBTASKS */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 flex items-center justify-between">
            <span>Subtasks ({subtasks.length})</span>
            <ListTodo size={13} className="text-[#85827A]" />
          </label>

          {subtasks.length > 0 && (
            <div className="space-y-2 mb-1">
              {subtasks.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#17171A] border border-[#23242A] text-xs text-[#F7F5F0]"
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffb86c] shrink-0" />
                    <span className="truncate">{s}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.filter((_, i) => i !== idx))}
                    className="text-[#85827A] hover:text-rose-400 p-1 transition cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a subtask and press enter..."
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtask();
                }
              }}
              className="flex-1 bg-[#17171A] border border-[#23242A] rounded-xl px-3.5 py-2.5 text-xs text-[#F7F5F0] placeholder:text-[#85827A]/50 focus:border-[#ffb86c]/60 focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={addSubtask}
              className="px-4 py-2.5 rounded-xl bg-[#1E1F24] hover:bg-[#282930] text-xs font-semibold text-[#ffb86c] border border-[#23242A] flex items-center justify-center transition cursor-pointer"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* SECTION: REPEAT */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 flex items-center justify-between">
            <span>Repeat Cadence</span>
            <Repeat size={13} className="text-[#85827A]" />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["none", "daily", "weekly", "custom"] as const).map((rt) => {
              const isSelected = recurringType === rt;
              return (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setRecurringType(rt)}
                  className={`px-4 py-2 rounded-xl border text-xs capitalize font-mono transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                      : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:bg-[#1E1F24] hover:text-[#C5C2BA]"
                  }`}
                >
                  {rt}
                </button>
              );
            })}
          </div>

          {recurringType === "custom" && (
            <div className="flex items-center gap-2.5 mt-2 bg-[#17171A] border border-[#23242A] rounded-xl px-3.5 py-2 max-w-fit">
              <span className="text-xs text-[#85827A]">Every</span>
              <input
                type="number"
                min="1"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value)}
                className="bg-[#111113] border border-[#23242A] text-center font-bold text-xs text-[#F7F5F0] rounded-lg w-14 py-1 focus:border-[#ffb86c] focus:outline-none"
              />
              <span className="text-xs text-[#85827A]">days</span>
            </div>
          )}
        </div>

        {/* SECTION: LINK TO GOAL */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 flex items-center justify-between">
            <span>Link to Strategic Goal / Habit</span>
            <Target size={13} className="text-[#85827A]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGoalId(null)}
              className={`px-4 py-2 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                goalId === null
                  ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                  : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:bg-[#1E1F24] hover:text-[#C5C2BA]"
              }`}
            >
              None
            </button>
            {goals.map((g: any) => {
              const gId = g.id || g._id;
              const isSelected = goalId === gId;
              return (
                <button
                  key={gId}
                  type="button"
                  onClick={() => setGoalId(gId)}
                  className={`px-4 py-2 rounded-xl border text-xs font-medium max-w-[280px] truncate transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold shadow-sm"
                      : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:bg-[#1E1F24] hover:text-[#C5C2BA]"
                  }`}
                >
                  {g.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION: ENERGY COST — X/10 */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 flex items-center justify-between">
            <span>Energy Cost — {energyCost}/10</span>
            <Zap size={13} className="text-[#ffb86c]" />
          </label>
          <div className="bg-[#17171A] border border-[#23242A] rounded-2xl p-4">
            <div className="flex items-center justify-between gap-1 sm:gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEnergyCost(v)}
                  className={`flex-1 aspect-square rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    energyCost >= v
                      ? "bg-[#ffb86c]/20 border border-[#ffb86c]/50"
                      : "bg-[#111113] border border-[#23242A] hover:bg-[#23242A]"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full transition-transform ${
                      energyCost >= v ? "bg-[#ffb86c] scale-125" : "bg-[#85827A]/40"
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 text-[10px] font-mono uppercase tracking-widest text-[#85827A]">
              <span>Low Cognitive Load</span>
              <span>High Cognitive Strain</span>
            </div>
          </div>
        </div>

        {/* SECTION: ESTIMATED DURATION */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-mono uppercase tracking-wider text-[#C5C2BA]/70 flex items-center justify-between">
            <span>Estimated Duration</span>
            <Timer size={13} className="text-[#85827A]" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((dp) => (
              <button
                key={dp.val}
                type="button"
                onClick={() => setEstimatedDuration(dp.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                  estimatedDuration === dp.val
                    ? "bg-[#ffb86c]/15 border-[#ffb86c] text-[#ffb86c] font-bold"
                    : "bg-[#17171A] border-[#23242A] text-[#85827A] hover:bg-[#1E1F24] hover:text-[#C5C2BA]"
                }`}
              >
                {dp.label}
              </button>
            ))}
            <div className="flex items-center bg-[#17171A] border border-[#23242A] rounded-xl px-3 py-1.5 focus-within:border-[#ffb86c]/60 transition-colors ml-auto">
              <input
                type="number"
                min="5"
                step="5"
                placeholder="Minutes"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-20 bg-transparent text-xs font-mono font-bold text-[#F7F5F0] focus:outline-none placeholder:text-[#85827A]/50 text-right pr-1"
              />
              <span className="text-xs font-mono text-[#85827A]">min</span>
            </div>
          </div>
        </div>

        {/* SUBMIT ACTIONS */}
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
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#492900] text-xs font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[#492900] border-t-transparent animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Create Task</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
