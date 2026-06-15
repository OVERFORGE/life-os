"use client";

import { useEffect, useState } from "react";
import { fetchGoalAdaptations } from "@/features/goals/api/fetchGoalAdaptations";
import { GoalAdaptationSuggestion } from "@/features/goals/types/GoalAdaptation";
import GoalAdaptationCard from "@/features/goals/components/GoalAdaptationCard";

export default function InsightsView() {

  const [suggestions, setSuggestions] = useState<GoalAdaptationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function load() {
      try {
        const data = await fetchGoalAdaptations();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();

  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      <h1 className="text-2xl font-semibold text-white mb-2">
        Jarvis System Insights
      </h1>

      <p className="text-sm text-white/60 mb-8">
        Jarvis analyzed your goals, current life phase, and workload pressure.
        The following adjustments may improve system stability.
      </p>

      {loading && (
        <p className="text-white/50 text-sm">
          Analyzing system state...
        </p>
      )}

      {!loading && suggestions.length === 0 && (
        <p className="text-white/50 text-sm">
          No adjustments recommended at this time.
        </p>
      )}

      <div className="grid gap-4">

        {suggestions.map((s, i) => (
          <GoalAdaptationCard
            key={i}
            suggestion={s}
          />
        ))}

      </div>

    </div>
  );
}