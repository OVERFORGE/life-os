"use client";

import { useEffect, useState } from "react";
import { Plus, ListFilter } from "lucide-react";
import { GoalList } from "@/features/goals/components/GoalList";

import { useRouter } from "next/navigation";

type Goal = {
  _id: string;
  title: string;
  stats?: {
    currentScore?: number;
    state?: string;
  };
  pressure?: {
    status: string;
  };
};

type GoalPressure = {
  goalId: string;
  pressure?: {
    status: string;
  };
};

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  async function loadGoals() {
    setLoading(true);
    try {
      const [goalsRes, pressureRes] = await Promise.all([
        fetch("/api/goals/list"),
        fetch("/api/insights/goal-adaptations"),
      ]);

      const goalsData = await goalsRes.json();
      const pressureData = await pressureRes.json();

      const suggestions = pressureData?.suggestions || [];
      const pressureMap = new Map<string, GoalPressure>(
        suggestions.map((s: GoalPressure) => [s.goalId, s])
      );

      const merged = goalsData.map((g: any) => ({
        ...g,
        pressure: pressureMap.get(g._id as string)?.pressure || null,
      }));

      setGoals(merged);
    } catch (err) {
      console.error("Failed to load goals", err);
    }
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

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-5xl mx-auto w-full">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">Goals</h1>
          <p className="text-sm text-gray-400 mt-1">Define outcomes, build identity, and track progress.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-lg text-sm text-gray-300 hover:bg-[#2A2B2F] transition-colors">
            <ListFilter size={16} /> Filters
          </button>
          <button 
            onClick={() => router.push("/goals/new")}
            className="flex items-center gap-2 px-4 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} /> New Goal
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 pb-10">
        
        {loading ? (
          <div className="text-sm text-gray-400">Loading goals...</div>
        ) : goals.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#1F2023] border border-dashed border-[#2A2B2F] flex flex-col items-center justify-center text-center space-y-4">
            <div className="text-base text-gray-400">
              You don't have any goals yet.
            </div>
            <button
              onClick={bootstrap}
              disabled={bootstrapping}
              className="px-4 py-2 bg-[#2A2B2F] text-gray-200 rounded-lg text-sm font-medium hover:bg-[#3A3C42] transition-colors"
            >
              {bootstrapping ? "Creating..." : "Create Starter Goals"}
            </button>
          </div>
        ) : (
          <GoalList items={goals} />
        )}
      </div>
    </div>
  );
}
