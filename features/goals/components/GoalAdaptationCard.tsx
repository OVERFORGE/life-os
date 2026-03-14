"use client";

import { GoalAdaptationSuggestion } from "@/features/goals/types/GoalAdaptation";
import { useState } from "react";

type Props = {
  suggestion: GoalAdaptationSuggestion;
};

export default function GoalAdaptationCard({ suggestion }: Props) {

  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  async function handleAction(action: "approve" | "dismiss") {
    setLoading(true);

    await fetch("/api/insights/goal-adaptations/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        goalId: suggestion.goalId,
        action,
        suggestedChange: suggestion.suggestedChange ?? null,
      }),
    });

    setHidden(true);
  }

  return (
    <div
      className="
      relative overflow-hidden
      rounded-xl
      border border-[#262a35]
      bg-gradient-to-br from-[#0f1115] to-[#0b0d11]
      p-6
      transition-all
      hover:border-[#3a3f4b]
      hover:shadow-xl
      "
    >

      {/* Header */}

      <div className="flex items-center justify-between mb-4">

        <h3 className="text-sm font-semibold text-white">
          Goal {suggestion.goalId.slice(-6)}
        </h3>

        <span
          className="
          text-[11px]
          px-2 py-1
          rounded-full
          bg-yellow-500/10
          text-yellow-400
          border border-yellow-500/20
          "
        >
          {suggestion.type.replace("_", " ")}
        </span>

      </div>

      {/* Reason */}

      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        {suggestion.reason}
      </p>

      {/* Actions */}

      <div className="flex gap-3">

        <button
          disabled={loading}
          onClick={() => handleAction("approve")}
          className="
          flex-1
          py-2
          rounded-lg
          text-sm
          font-medium
          bg-[#1c8c5a]
          hover:bg-[#22a86a]
          text-white
          transition
          disabled:opacity-50
          "
        >
          Approve
        </button>

        <button
          disabled={loading}
          onClick={() => handleAction("dismiss")}
          className="
          flex-1
          py-2
          rounded-lg
          text-sm
          border border-[#2a2f3a]
          text-gray-300
          hover:border-[#3a3f4b]
          transition
          disabled:opacity-50
          "
        >
          Dismiss
        </button>

      </div>

    </div>
  );
}