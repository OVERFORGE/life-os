import { Log } from "./stats";
import { getDayScore } from "./heatmap";
import { calculateStreak } from "./stats";

function longestStreak(logs: Log[], predicate: (l: Log) => boolean) {
  let best = 0;
  let current = 0;

  for (const l of logs) {
    if (predicate(l)) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function bestWeekAverage(
  logs: Log[],
  extractor: (l: Log) => number | undefined
) {
  if (logs.length < 7) return 0;

  let best = 0;

  for (let i = 0; i <= logs.length - 7; i++) {
    const week = logs.slice(i, i + 7);
    const vals = week.map((l) => extractor(l) || 0);
    const avg = vals.reduce((a, b) => a + b, 0) / 7;
    best = Math.max(best, avg);
  }

  return best;
}

export function computePersonalRecords(logs: Log[]) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  const bestGymStreak = longestStreak(sorted, (l) => l.physical?.gym === true);
  const bestCodingStreak = longestStreak(sorted, (l) => l.work?.coded === true);
  const bestNoFapStreak = longestStreak(sorted, (l) => l.habits?.noFap === true);

  const bestSleepWeek = bestWeekAverage(sorted, (l) => l.sleep?.hours);
  const bestEnergyWeek = bestWeekAverage(sorted, (l) => l.mental?.energy);

  const bestFocusDay = Math.max(
    ...sorted.map((l) => l.mental?.focus || 0),
    0
  );

  const bestDisciplineDay = Math.max(
    ...sorted.map((l) => getDayScore(l)),
    0
  );

  return {
    bestGymStreak,
    bestCodingStreak,
    bestNoFapStreak,
    bestSleepWeek,
    bestEnergyWeek,
    bestFocusDay,
    bestDisciplineDay,
  };
}
