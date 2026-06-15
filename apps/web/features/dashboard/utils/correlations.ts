import { Log } from "./stats";

export function pearsonCorrelation(x: number[], y: number[]) {
  const n = x.length;
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  return num / Math.sqrt(denX * denY || 1);
}

export function computeCorrelations(logs: Log[]) {
  const valid = logs.filter(
    (l) => l.sleep && l.mental && l.work && l.physical
  );

  const sleepHours = valid.map((l) => l.sleep?.hours || 0);
  const mood = valid.map((l) => l.mental?.mood || 0);

  const gym = valid.map((l) => (l.physical?.gym ? 1 : 0));
  const energy = valid.map((l) => l.mental?.energy || 0);

  const sleepQuality = valid.map((l) => l.sleep?.quality || 0);
  const focus = valid.map((l) => l.mental?.focus || 0);

  const coding = valid.map((l) => (l.work?.coded ? 1 : 0));

  return {
    sleepMood: pearsonCorrelation(sleepHours, mood),
    gymEnergy: pearsonCorrelation(gym, energy),
    sleepFocus: pearsonCorrelation(sleepQuality, focus),
    codingFocus: pearsonCorrelation(coding, focus),
  };
}
