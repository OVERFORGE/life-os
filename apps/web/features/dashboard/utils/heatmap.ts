import { Log } from "./stats";

export function getDayScore(log: Log) {
  let score = 0;

  if (log.physical?.gym) score += 1;
  if (log.work?.coded) score += 1;
  if (log.habits?.noFap) score += 1;
  if ((log.work?.deepWorkHours || 0) > 0) score += 1;
  if (log.mental?.mood) score += log.mental.mood / 10;

  return score;
}

export function scoreToColor(score: number) {
  if (score === 0) return "bg-[#1a1d26]";
  if (score < 1.5) return "bg-red-900/40";
  if (score < 2.5) return "bg-yellow-900/40";
  if (score < 3.5) return "bg-green-900/40";
  return "bg-green-500/70";
}

export function buildHeatmapDays(logs: Log[]) {
  const scoreMap = new Map<string, number>();
  logs.forEach((l) => scoreMap.set(l.date, getDayScore(l)));

  const days: { date: string; score: number }[] = [];
  const today = new Date();

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const dateStr = `${yyyy}-${mm}-${dd}`;

    days.push({
      date: dateStr,
      score: scoreMap.get(dateStr) || 0,
    });
  }

  return days;
}
