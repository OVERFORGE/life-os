// features/insights/engine/insightsEngine.ts

type PhaseType =
  | "burnout"
  | "recovery"
  | "slump"
  | "grind"
  | "balanced";

type GoalLoadMode =
  | "stable"
  | "underutilized"
  | "overloaded";

type InsightInput = {
  phase: PhaseType;

  goalLoad: {
    mode: GoalLoadMode;
    score: number;
    distribution: {
      aligned: number;
      strained: number;
      conflicting: number;
      toxic: number;
    };
  };

  signals: {
    sleepScore: number;
    energyScore: number;
    stressScore: number;
    moodScore: number;
  };

  recentTrend?: {
    sleepTrend?: number;
    stressTrend?: number;
    energyTrend?: number;
  };
};

export type SystemInsight = {
  systemState: string;
  risks: string[];
  recommendations: string[];
  observations: string[];
};

/* ------------------------------------------------ */
/* Risk Detection                                   */
/* ------------------------------------------------ */

function detectRisks(input: InsightInput): string[] {
  const risks: string[] = [];

  if (input.signals.sleepScore < 0.4) {
    risks.push("Sleep deficit detected");
  }

  if (input.signals.stressScore > 0.65) {
    risks.push("Elevated stress levels");
  }

  if (input.signals.energyScore < 0.4) {
    risks.push("Low energy availability");
  }

  if (input.goalLoad.mode === "overloaded") {
    risks.push("System workload overload");
  }

  if (input.goalLoad.distribution.toxic > 0) {
    risks.push("At least one goal is structurally toxic");
  }

  return risks;
}

/* ------------------------------------------------ */
/* Observations                                     */
/* ------------------------------------------------ */

function generateObservations(input: InsightInput): string[] {
  const observations: string[] = [];

  if (input.phase === "recovery") {
    observations.push(
      "System is currently in recovery mode."
    );
  }

  if (input.phase === "burnout") {
    observations.push(
      "System stability is compromised due to burnout."
    );
  }

  if (input.phase === "grind") {
    observations.push(
      "High productivity phase detected."
    );
  }

  if (input.goalLoad.mode === "underutilized") {
    observations.push(
      "Available system capacity is not fully used."
    );
  }

  if (input.goalLoad.mode === "stable") {
    observations.push(
      "Goal load is currently balanced with system capacity."
    );
  }

  return observations;
}

/* ------------------------------------------------ */
/* Recommendation Engine                            */
/* ------------------------------------------------ */

function generateRecommendations(
  input: InsightInput,
  risks: string[]
): string[] {
  const recs: string[] = [];

  if (input.phase === "recovery") {
    recs.push(
      "Focus on stabilization rather than progress."
    );
  }

  if (input.phase === "burnout") {
    recs.push(
      "Reduce workload immediately and prioritize recovery."
    );
  }

  if (input.goalLoad.mode === "overloaded") {
    recs.push(
      "Reduce goal cadence or temporarily pause one goal."
    );
  }

  if (input.goalLoad.mode === "underutilized") {
    recs.push(
      "Introduce a moderate challenge to increase engagement."
    );
  }

  if (risks.includes("Sleep deficit detected")) {
    recs.push(
      "Prioritize sleep recovery within the next 48 hours."
    );
  }

  if (risks.includes("Elevated stress levels")) {
    recs.push(
      "Reduce cognitive load and schedule a recovery block."
    );
  }

  return recs;
}

/* ------------------------------------------------ */
/* Main Engine                                      */
/* ------------------------------------------------ */

export function insightsEngine(
  input: InsightInput
): SystemInsight {
  const risks = detectRisks(input);

  const observations = generateObservations(input);

  const recommendations = generateRecommendations(
    input,
    risks
  );

  let systemState = "Balanced System";

  if (input.phase === "burnout") {
    systemState = "Burnout State";
  }

  if (input.phase === "recovery") {
    systemState = "Recovery Phase";
  }

  if (input.phase === "slump") {
    systemState = "Low Momentum Phase";
  }

  if (input.phase === "grind") {
    systemState = "High Performance Phase";
  }

  return {
    systemState,
    risks,
    recommendations,
    observations,
  };
}