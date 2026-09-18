import { segmentLifeEras } from "../apps/web/features/insights/engine/segmentLifeEras";
import { nameLifeEra } from "../apps/web/features/insights/engine/nameLifeEra";

// Alex Chen compounding trajectory (Weeks 1 to 16)
const phases = [
  { phase: "grind", startDate: "2026-09-01", endDate: "2026-09-03", durationDays: 3, snapshot: { avgMood: 65, avgEnergy: 65, avgStress: 65, avgSleep: 6.0, avgDeepWork: 5.0 } },
  { phase: "recovery", startDate: "2026-09-04", endDate: "2026-09-06", durationDays: 3, snapshot: { avgMood: 60, avgEnergy: 55, avgStress: 50, avgSleep: 7.0, avgDeepWork: 3.5 } },
  { phase: "balanced", startDate: "2026-09-07", endDate: "2026-09-30", durationDays: 24, snapshot: { avgMood: 84, avgEnergy: 84, avgStress: 30, avgSleep: 7.5, avgDeepWork: 6.4 } },
  { phase: "balanced", startDate: "2026-10-01", endDate: "2026-10-31", durationDays: 30, snapshot: { avgMood: 90, avgEnergy: 90, avgStress: 22, avgSleep: 7.5, avgDeepWork: 6.8 } },
  { phase: "balanced", startDate: "2026-11-01", endDate: "2026-11-30", durationDays: 30, snapshot: { avgMood: 94, avgEnergy: 94, avgStress: 18, avgSleep: 7.6, avgDeepWork: 7.0 } },
  { phase: "balanced", startDate: "2026-12-01", endDate: "2026-12-31", durationDays: 31, snapshot: { avgMood: 96, avgEnergy: 96, avgStress: 15, avgSleep: 7.8, avgDeepWork: 7.2 } },
];

const eras = segmentLifeEras(phases);
console.log("Segmented Eras Count:", eras.length);

for (let i = 0; i < eras.length; i++) {
  const era = eras[i];
  const narrative = nameLifeEra(era);
  console.log(`\nEra ${i + 1} (${era.from} -> ${era.to}):`);
  console.log(`  Dominant Phase: ${era.dominantPhase}`);
  console.log(`  Direction: ${era.direction}`);
  console.log(`  Volatility: ${era.volatility.toFixed(4)} | Stability: ${era.stability.toFixed(4)}`);
  console.log(`  TITLE: "${narrative.title}" (${narrative.subtitle})`);
  console.log(`  THEME: ${narrative.theme}`);
  console.log(`  Story: ${narrative.story.slice(0, 80)}...`);
}
