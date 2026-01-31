import { PhaseExplanation } from "@/features/insights/engine/explainLifePhase";

export type GoalAdaptation = {
  mode: "normal" | "maintenance" | "reduced" | "paused";
  cadenceOverride?: "daily" | "weekly" | "flexible";
  intensityNote: string;
  rationale: string[];
};

export function adaptGoalToPhase({
  goal,
  phase,
}: {
  goal: any;
  phase: PhaseExplanation & { phase?: string };
}): GoalAdaptation {
  const rationale: string[] = [];

  // Default (no adaptation)
  let mode: GoalAdaptation["mode"] = "normal";
  let cadenceOverride: GoalAdaptation["cadenceOverride"] | undefined;
  let intensityNote = "Operate as usual.";

  // ---------------------------
  // SLUMP
  // ---------------------------
  if (phase.phase === "slump") {
    if (goal.type === "performance") {
      mode = "maintenance";
      cadenceOverride = "flexible";
      intensityNote = "Preserve continuity, avoid pushing output.";
      rationale.push(
        "Energy and motivation are suppressed in slump phases."
      );
    }

    if (goal.type === "identity") {
      mode = "reduced";
      cadenceOverride = "weekly";
      intensityNote = "Lower expectations, keep identity alive.";
      rationale.push(
        "Identity goals should remain visible but non-demanding."
      );
    }
  }

    // ---------------------------
    // RECOVERY (goal-sensitive)
    // ---------------------------
    if (phase.phase === "recovery") {
    if (goal.type === "performance") {
        mode = "maintenance";
        cadenceOverride = "flexible";
        intensityNote = "Stability first, progress second.";
        rationale.push(
        "Performance goals are costly during recovery phases."
        );
    }

    if (goal.type === "identity") {
        mode = "normal";
        cadenceOverride = "weekly";
        intensityNote = "Maintain identity with low-effort actions.";
        rationale.push(
        "Identity goals support recovery when kept lightweight."
        );
    }

    if (goal.type === "maintenance") {
        mode = "normal";
        intensityNote = "Continue gently; avoid optimization.";
        rationale.push(
        "Maintenance goals help stabilize the system."
        );
    }
    }


  // ---------------------------
  // BURNOUT
  // ---------------------------
  if (phase.phase === "burnout") {
    if (goal.type === "performance") {
      mode = "paused";
      cadenceOverride = "flexible";
      intensityNote = "Pause performance pressure temporarily.";
      rationale.push(
        "Performance pressure during burnout prolongs recovery."
      );
    }

    if (goal.type === "identity") {
      mode = "maintenance";
      cadenceOverride = "weekly";
      intensityNote = "Minimal symbolic action only.";
      rationale.push(
        "Identity goals should be symbolic, not demanding."
      );
    }
  }

  // ---------------------------
  // BALANCED / GRIND
  // ---------------------------
  if (
    phase.phase === "balanced" ||
    phase.phase === "grind"
  ) {
    mode = "normal";
    intensityNote = "System supports forward momentum.";
    rationale.push(
      "Current phase supports goal execution."
    );
  }

  return {
    mode,
    cadenceOverride,
    intensityNote,
    rationale,
  };
}
