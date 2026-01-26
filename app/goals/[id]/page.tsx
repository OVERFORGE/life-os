"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AddSignalModal } from "@/features/goals/components/AddSignalModal";
type Signal = {
  key: string;
  weight: number;
};

export default function GoalDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSignal, setShowAddSignal] = useState(false);
  const [draftSignals, setDraftSignals] = useState<Signal[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [history, setHistory] = useState<{ date: string; score: number; state: string }[]>([]);

  useEffect(() => {
    fetch(`/api/goals/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d?.goal?.signals) {
          setDraftSignals(d.goal.signals);
        }
      })
      .finally(() => setLoading(false));
    fetch(`/api/goals/${id}/history`)
        .then((r) => r.json())
        .then(setHistory);
  }, [id]);

  if (loading)
    return <div className="p-6 text-gray-400">Loading goal...</div>;

  if (!data || data.error)
    return <div className="p-6 text-red-400">Goal not found</div>;

  const { goal, stats, explanation } = data;

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{goal.title}</h1>

            <div className="flex items-center gap-6 text-sm text-gray-400">
              <StatusPill state={stats?.state} />
              <div>Score: {stats?.currentScore ?? 0}%</div>
            </div>
          </div>

          {/* Edit Button */}
          {!isEditing && (
            <button
              onClick={() => {
                setIsEditing(true);
                setDirty(false);
                setDraftSignals(goal.signals);
              }}
              className="text-sm px-4 py-2 rounded-lg border border-[#232632] bg-[#161922] hover:bg-[#1b1f2a]"
            >
              Edit
            </button>
          )}
        </div>

          <GoalTimeline history={history} />
        {/* Signals */}
        <div className="space-y-4">
          <div className="text-sm text-gray-400">
            Signals (last 14 days)
          </div>
          {isEditing && (
                <button
                onClick={() => setShowAddSignal(true)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[#232632] bg-[#161922] hover:bg-[#1b1f2a]"
                >
                + Add Signal
                </button>
            )}
          {draftSignals.map((s: Signal, idx: number) => {
            const explanationSignal = explanation.signals.find(
              (x: any) => x.key === s.key
            );

            return (
              <div
                key={s.key}
                className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="text-sm font-medium text-gray-200">
                    {s.key}
                  </div>

                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <>
                        {/* Weight Input */}
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={s.weight}
                          onChange={(e) => {
                            const next = [...draftSignals];
                            next[idx] = {
                              ...next[idx],
                              weight: Number(e.target.value),
                            };
                            setDraftSignals(next);
                            setDirty(true);
                          }}
                          className="w-16 bg-[#0f1115] border border-[#232632] rounded px-2 py-1 text-sm"
                        />

                        {/* Remove */}
                        <button
                          onClick={() => {
                            const next = draftSignals.filter((_, i) => i !== idx);
                            setDraftSignals(next);
                            setDirty(true);
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <div className="text-sm text-gray-400">
                        Weight {s.weight}
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity blocks */}
                <div className="flex gap-1">
                  {(explanationSignal?.values || []).map(
                    (v: number, i: number) => (
                      <div
                        key={i}
                        className={`h-3 w-full rounded-sm ${
                          v
                            ? "bg-[#2a2f3a]"
                            : "bg-[#0f1115] border border-[#232632]"
                        }`}
                      />
                    )
                  )}
                </div>

                <div className="text-xs text-gray-400">
                  Active {explanationSignal?.activeDays ?? 0} / 14 days
                </div>
              </div>
            );
          })}
        </div>

        {/* Save / Cancel Buttons */}
        {isEditing && (
          <div className="flex gap-3 pt-4">
            <button
              disabled={saving || !dirty}
              onClick={async () => {
                setSaving(true);
                await fetch(`/api/goals/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    signals: draftSignals,
                    rules: goal.rules,
                  }),
                });
                window.location.reload();
              }}
              className="px-5 py-3 rounded-xl bg-white text-black font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              onClick={() => {
                setIsEditing(false);
                setDraftSignals(goal.signals);
                setDirty(false);
              }}
              className="px-5 py-3 rounded-xl border border-[#232632] text-gray-300"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Explanation */}
        <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 text-sm text-gray-400">
          <div className="font-medium mb-2 text-gray-300">
            How this goal is evaluated
          </div>
          <p className="leading-relaxed">
            This goal listens to {goal.signals.length} behavioral signals from
            your daily logs. Each signal contributes based on its weight and
            consistency over the last 14 days. The score represents how aligned
            your recent behavior is with this goal.
          </p>
        </div>
        {showAddSignal && (
        <AddSignalModal
            existingKeys={draftSignals.map((s) => s.key)}
            onClose={() => setShowAddSignal(false)}
            onAdd={(signal) => {
            setDraftSignals([...draftSignals, signal]);
            setDirty(true);
            }}
        />
        )}
      </div>
    </div>
  );
}

/* ---------- UI Components ---------- */

function StatusPill({ state }: { state: string }) {
  const map: Record<
    string,
    { label: string; color: string }
  > = {
    on_track: { label: "On Track", color: "bg-green-400" },
    slow: { label: "Slow", color: "bg-yellow-400" },
    drifting: { label: "Drifting", color: "bg-red-400" },
    stalled: { label: "Stalled", color: "bg-gray-400" },
    recovering: { label: "Recovering", color: "bg-blue-400" },
  };

  const cfg = map[state] || {
    label: "Unknown",
    color: "bg-gray-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
      <span className="text-gray-300">{cfg.label}</span>
    </div>
  );
}

function GoalTimeline({
  history,
}: {
  history: { date: string; score: number; state: string }[];
}) {
  if (!history.length) return null;

  const stateColor = (state: string) => {
    switch (state) {
      case "on_track":
        return "bg-green-500";
      case "slow":
        return "bg-yellow-400";
      case "drifting":
        return "bg-red-500";
      case "recovering":
        return "bg-blue-500";
      case "stalled":
        return "bg-gray-500";
      default:
        return "bg-gray-700";
    }
  };

  return (
    <div className="bg-[#161922] border border-[#232632] rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium text-gray-300">
        Progress Over Time
      </div>

      <div className="flex flex-wrap gap-2">
        {history.map((h) => (
          <div
            key={h.date}
            title={`${h.date} — ${h.state} — ${h.score}%`}
            className={`w-4 h-4 rounded-sm ${stateColor(h.state)}`}
          />
        ))}
      </div>

      <div className="flex gap-4 text-xs text-gray-400 pt-2">
        <LegendDot color="bg-green-500" label="On Track" />
        <LegendDot color="bg-yellow-400" label="Slow" />
        <LegendDot color="bg-red-500" label="Drifting" />
        <LegendDot color="bg-blue-500" label="Recovering" />
        <LegendDot color="bg-gray-500" label="Stalled" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-3 h-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}
