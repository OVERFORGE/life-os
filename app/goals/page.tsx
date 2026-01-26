"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Goal = {
  _id: string;
  title: string;
  stats?: {
    currentScore?: number;
    state?: string;
  };
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  async function loadGoals() {
    setLoading(true);
    const res = await fetch("/api/goals/list");
    const data = await res.json();
    setGoals(data);
    setLoading(false);
  }

  useEffect(() => {
    loadGoals();
  }, []);

  async function bootstrap() {
    setBootstrapping(true);
    await fetch("/api/goals/bootstrap", { method: "POST" });
    await loadGoals();
    setBootstrapping(false);
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading goals...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Goals</h1>

        <Link
            href="/goals/new"
            className="px-4 py-2 rounded-xl bg-white text-black font-semibold active:scale-[0.98] transition"
        >
            + New Goal
        </Link>
        </div>

        {/* Empty State */}
        {goals.length === 0 && (
          <div className="bg-[#161922] border border-[#232632] rounded-xl p-8 text-center space-y-4">
            <div className="text-gray-300">
              You don't have any goals yet.
            </div>

            <button
              onClick={bootstrap}
              disabled={bootstrapping}
              className="px-5 py-3 rounded-xl bg-white text-black font-semibold active:scale-[0.98] transition"
            >
              {bootstrapping ? "Creating..." : "Create Starter Goals"}
            </button>
          </div>
        )}

        {/* Goals Grid */}
        {goals.length > 0 && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {goals.map((g) => {
      const score = g.stats?.currentScore ?? 0;
      const state = g.stats?.state ?? "unknown";

      return (
        <Link key={g._id} href={`/goals/${g._id}`}>
          <div className="bg-[#161922] border border-[#232632] rounded-xl p-5 space-y-4 hover:border-gray-600 transition cursor-pointer">
            <div className="flex justify-between items-center">
              <div className="font-semibold text-lg">{g.title}</div>
              <StateBadge state={state} />
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Progress</span>
                <span>{score}%</span>
              </div>
              <div className="h-2 bg-[#0f1115] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          </div>
        </Link>
      );
    })}
  </div>
)}

      </div>
    </div>
  );
}

/* ---------- UI Bits ---------- */

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    on_track: "bg-green-500/20 text-green-400 border-green-500/30",
    slow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    drifting: "bg-red-500/20 text-red-400 border-red-500/30",
    stalled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    recovering: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    unknown: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full border ${
        map[state] || map.unknown
      }`}
    >
      {state.replace("_", " ")}
    </span>
  );
}
