import { LifeEra, LifeDirection ,Phase } from "../types";

import crypto from "crypto";

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function computeDirection(phases: any[]): LifeDirection {
  if (phases.length < 2) return "flat";

  const moods = phases.map(p => p.snapshot?.avgMood ?? 0);
  const energies = phases.map(p => p.snapshot?.avgEnergy ?? 0);

  const delta =
    (moods[moods.length - 1] - moods[0]) +
    (energies[energies.length - 1] - energies[0]);

  if (delta > 1) return "up";
  if (delta < -1) return "down";

  // volatility heuristic
  const variance =
    avg(moods.map(m => Math.abs(m - avg(moods)))) +
    avg(energies.map(e => Math.abs(e - avg(energies))));

  if (variance > 1.5) return "chaotic";

  return "flat";
}

function computeVolatility(phases: any[]): number {
  const moods = phases.map(p => p.snapshot?.avgMood ?? 0);
  const energies = phases.map(p => p.snapshot?.avgEnergy ?? 0);

  const moodVar = avg(moods.map(m => Math.abs(m - avg(moods))));
  const energyVar = avg(energies.map(e => Math.abs(e - avg(energies))));

  return Math.min(1, (moodVar + energyVar) / 4);
}

function dominantPhase(phases: any[]): Phase {
  const counts: Record<string, number> = {};

  for (const p of phases) {
    counts[p.phase] = (counts[p.phase] || 0) + p.durationDays;
  }

  let max = 0;
  let winner: Phase = phases[0].phase;

  for (const k in counts) {
    if (counts[k] > max) {
      max = counts[k];
      winner = k as Phase;
    }
  }

  return winner;
}

function summarize(phases: any[]) {
  return {
    avgMood: avg(phases.map(p => p.snapshot?.avgMood ?? 0)),
    avgEnergy: avg(phases.map(p => p.snapshot?.avgEnergy ?? 0)),
    avgStress: avg(phases.map(p => p.snapshot?.avgStress ?? 0)),
    avgSleep: avg(phases.map(p => p.snapshot?.avgSleep ?? 0)),
    avgDeepWork: avg(phases.map(p => p.snapshot?.avgDeepWork ?? 0)),
  };
}

function shouldBreakEra(prev: any, next: any, buffer: any[]): boolean {
  // 🚨 Hard regime breaks
  if (prev.phase === "grind" && next.phase === "burnout") return true;
  if (prev.phase === "balanced" && (next.phase === "slump" || next.phase === "burnout")) return true;
  if (prev.phase === "recovery" && next.phase === "balanced") return true;

  // 🔁 Big confidence drop
  if ((prev.confidence ?? 0.7) - (next.confidence ?? 0.7) > 0.3) return true;

  // 🕳 Long dark phase = new chapter
  if (next.durationDays > 45 && (next.phase === "slump" || next.phase === "burnout")) {
    return true;
  }

  // 🕰 Hard time split (prevents mega-eras)
  const eraStart = new Date(buffer[0].startDate).getTime();
  const nextStart = new Date(next.startDate).getTime();
  const days = (nextStart - eraStart) / (1000 * 60 * 60 * 24);

  if (days > 120) return true;

  // 🌊 Phase instability spike
  if (buffer.length >= 4) {
    const last4 = buffer.slice(-4).map(p => p.phase).join(",");
    if (last4.includes("balanced") && last4.includes("slump") && last4.includes("drifting")) {
      return true;
    }
  }

  return false;
}


export function segmentLifeEras(phases: any[]): LifeEra[] {
  if (!phases || phases.length === 0) return [];

  const eras: LifeEra[] = [];

  let buffer: any[] = [];

  function flushEra() {
    if (buffer.length === 0) return;

    const dir = computeDirection(buffer);
    const vol = computeVolatility(buffer);
    const dom = dominantPhase(buffer);

    const era: LifeEra = {
      id: `${buffer[0].startDate}_${buffer[buffer.length - 1].endDate ?? "now"}`,
      from: buffer[0].startDate,
      to: buffer[buffer.length - 1].endDate ?? null,
      phases: buffer,
      dominantPhase: dom,
      direction: dir,
      volatility: vol,
      stability: 1 - vol,
      confidence: avg(buffer.map(p => p.confidence ?? 0.7)),
      summaryVector: summarize(buffer),
    };

    eras.push(era);
    buffer = [];
  }

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];

    if (buffer.length === 0) {
      buffer.push(p);
      continue;
    }

    const prev = buffer[buffer.length - 1];

    if (shouldBreakEra(prev, p, buffer)) {
      flushEra();
    }

    buffer.push(p);
  }

  flushEra();

  return eras;
}
