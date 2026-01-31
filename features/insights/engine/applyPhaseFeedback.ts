import { updatePhaseSensitivityFromFeedback } from "./updatePhaseSensitivityFromFeedback";

const MIN_DAYS_BETWEEN_CHANGES = 5;
const MIN_CONFIDENCE = 0.6;

export function applyPhaseFeedback({
  previousPhase,
  currentPhase,
  snapshot,
  currentSensitivity,
  lastChangeDate,
}: {
  previousPhase: string;
  currentPhase: string;
  snapshot: any;
  currentSensitivity: any;
  lastChangeDate?: string;
}) {
  // 1️⃣ Ignore weak signals
  if (!snapshot?.confidence || snapshot.confidence < MIN_CONFIDENCE) {
    return { changed: false };
  }

  // 2️⃣ Cooldown
  if (lastChangeDate) {
    const days =
      (Date.now() - new Date(lastChangeDate).getTime()) /
      (1000 * 60 * 60 * 24);

    if (days < MIN_DAYS_BETWEEN_CHANGES) {
      return { changed: false };
    }
  }

  // 3️⃣ Apply learning
  const next = updatePhaseSensitivityFromFeedback({
    previousPhase,
    currentPhase,
    delta: snapshot.delta,
    currentSensitivity,
  });

  const changed =
    JSON.stringify(next) !== JSON.stringify(currentSensitivity);

  return {
    changed,
    nextSensitivity: next,
    reason: `Adjusted after ${previousPhase} → ${currentPhase}`,
  };
}
