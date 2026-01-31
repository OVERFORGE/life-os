import { PhaseHistory } from "../models/PhaseHistory";
import { LifeSettings } from "../models/LifeSettings";

function clamp(min: number, v: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export async function runPhaseFeedbackLoop(userId: string) {
  // We need at least 2 phases to learn
  const phases = await PhaseHistory.find({ userId })
    .sort({ startDate: 1 })
    .lean();

  if (phases.length < 2) return;

  const settings = await LifeSettings.findOne({ userId });
  if (!settings) return;

  const learned = settings.learned?.phaseSensitivity || {
    sleepImpact: 1,
    stressImpact: 1,
    energyImpact: 1,
    moodImpact: 1,
  };

  // Look at last transition
  const prev = phases[phases.length - 2];
  const curr = phases[phases.length - 1];

  if (!prev.snapshot || !curr.snapshot) return;

  const deltas = {
    sleep: curr.snapshot.avgSleep - prev.snapshot.avgSleep,
    stress: curr.snapshot.avgStress - prev.snapshot.avgStress,
    energy: curr.snapshot.avgEnergy - prev.snapshot.avgEnergy,
    mood: curr.snapshot.avgMood - prev.snapshot.avgMood,
  };

  // If system expected recovery but still went to slump/burnout → learn
  const badOutcome =
    prev.phase === "recovery" &&
    (curr.phase === "slump" || curr.phase === "burnout");

  if (!badOutcome) return;

  // Apply small learning rate
  const lr = 0.05;

  settings.learned = {
    phaseSensitivity: {
      sleepImpact: clamp(
        0.5,
        learned.sleepImpact + lr * Math.sign(deltas.sleep || 0),
        2
      ),
      stressImpact: clamp(
        0.5,
        learned.stressImpact + lr * Math.sign(deltas.stress || 0),
        2
      ),
      energyImpact: clamp(
        0.5,
        learned.energyImpact + lr * Math.sign(deltas.energy || 0),
        2
      ),
      moodImpact: clamp(
        0.5,
        learned.moodImpact + lr * Math.sign(deltas.mood || 0),
        2
      ),
    },
  };

  await settings.save();
}
