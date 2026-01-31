import { Goal } from "@/features/goals/models/Goal";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

type GoalPressure = {
  goalId: string;
  pressureScore: number;
  status: "aligned" | "strained" | "conflicting" | "toxic";
  reasons: string[];
};

type GoalPressureWeights = {
  cadence: number;
  energy: number;
  stress: number;
  phaseMismatch: number;
};

function clamp(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function analyzeGlobalGoalLoad({
  userId,
  weights,
}: {
  userId: string;
  weights: GoalPressureWeights;
}) {
  /* ---------------- Load data ---------------- */

  const goals = await Goal.find({ userId, archived: false }).lean();
  const currentPhase = await PhaseHistory.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean();

  /* ---------------- Per-goal pressure ---------------- */

  const perGoal: GoalPressure[] = goals.map((goal) => {
    let score = 0;
    const reasons: string[] = [];

    // cadence
    if (goal.cadence === "daily") {
      score += weights.cadence;
      reasons.push("High cadence");
    }

    // energy
    if (goal.energyCost === "high") {
      score += weights.energy;
      reasons.push("High energy cost");
    }

    // stress
    if (goal.stressImpact === "high") {
      score += weights.stress;
      reasons.push("Stressful goal");
    }

    // phase mismatch
    if (currentPhase && goal.recommendedPhase) {
      if (goal.recommendedPhase !== currentPhase.phase) {
        score += weights.phaseMismatch;
        reasons.push("Phase mismatch");
      }
    }

    score = clamp(score);

    let status: GoalPressure["status"] = "aligned";
    if (score > 0.7) status = "toxic";
    else if (score > 0.45) status = "conflicting";
    else if (score > 0.25) status = "strained";

    return {
      goalId: goal._id.toString(),
      pressureScore: score,
      status,
      reasons,
    };
  });

  /* ---------------- Global aggregation ---------------- */

  const distribution = {
    aligned: 0,
    strained: 0,
    conflicting: 0,
    toxic: 0,
  };

  let totalScore = 0;
  const dominantPressures: string[] = [];

  for (const p of perGoal) {
    distribution[p.status]++;
    totalScore += p.pressureScore;

    if (p.pressureScore > 0.45) {
      dominantPressures.push(...p.reasons);
    }
  }

  const avgScore = perGoal.length
    ? totalScore / perGoal.length
    : 0;

  let mode = "balanced";
  if (avgScore > 0.6) mode = "overloaded";
  else if (avgScore > 0.35) mode = "constrained";

  return {
    global: {
      score: clamp(avgScore),
      mode,
      distribution,
      dominantPressures: [...new Set(dominantPressures)],
      recommendation:
        mode === "overloaded"
          ? "Reduce goal intensity or cadence."
          : mode === "constrained"
          ? "Goals are demanding but manageable."
          : "Goal load is healthy.",
    },
    perGoal,
  };
}
