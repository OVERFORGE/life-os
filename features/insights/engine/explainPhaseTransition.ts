export function explainPhaseTransition({
  prev,
  current,
  delta,
}: {
  prev: any;
  current: any;
  delta: any;
}) {
  const causes: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Sleep & Stress
  if (delta.avgSleep < -0.7 && delta.avgStress > 0.7) {
    causes.push("Sleep dropped while stress increased");
    warnings.push("Your nervous system is under sustained load");
    suggestions.push("Prioritize sleep and reduce cognitive load");
  }

  // Mood & Energy
  if (delta.avgMood < -0.8) {
    causes.push("Mood has been consistently dropping");
    suggestions.push("You may be emotionally overloaded or mentally fatigued");
  }

  // Work intensity spike
  if (delta.workIntensity > 1.2 && delta.avgSleep < -0.5) {
    causes.push("Work intensity increased while recovery decreased");
    warnings.push("This is a classic burnout pattern");
    suggestions.push("Reduce output temporarily and stabilize recovery");
  }

  // Consistency drop
  if (delta.consistency < -0.3) {
    causes.push("Your consistency collapsed");
    suggestions.push("Rebuild structure before pushing intensity");
  }

  let summary = "A behavioral shift was detected.";

  if (current.phase === "burnout") {
    summary = "You pushed performance while sacrificing recovery for too long.";
  } else if (current.phase === "slump") {
    summary = "Your energy, mood and discipline dropped simultaneously.";
  } else if (current.phase === "recovery") {
    summary = "Your system is exiting overload and stabilizing.";
  } else if (current.phase === "grind") {
    summary = "You are in a high-output, high-pressure execution phase.";
  } else if (current.phase === "balanced") {
    summary = "Your metrics stabilized into a sustainable range.";
  }

  return {
    summary,
    causes,
    warnings,
    suggestions,
  };
}
