// features/signals/engine/computeCategoryScore.ts

import { LifeSignal } from "../models/LifeSignal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { computeSignalScore } from "./computeSignalScore";

/**
 * Compute dynamic category score (Discipline, Recovery, etc.)
 *
 * ✅ Uses categoryKey correctly
 */

export async function computeCategoryScore({
  userId,
  date,
  categoryKey,
}: {
  userId: string;
  date: string;
  categoryKey: string;
}) {
  const defs = await LifeSignal.find({
    userId,
    categoryKey, // ✅ FIXED
    enabled: true,
  }).lean();

  const log = await DailyLog.findOne({ userId, date }).lean();

  if (!log) {
    return { score: 0, breakdown: [] };
  }

  const signalsObj = log.signals || {};

  let totalWeight = 0;
  let totalScore = 0;

  const breakdown: any[] = [];

  for (const def of defs) {
    const rawValue =
      typeof signalsObj[def.key] === "number"
        ? signalsObj[def.key]
        : 0;

    const s = computeSignalScore({
      value: rawValue,
      target: def.target,
      direction: def.direction,
    });

    totalWeight += def.weight;
    totalScore += s * def.weight;

    breakdown.push({
      key: def.key,
      label: def.label,
      value: rawValue,
      target: def.target,
      score: s,
      weight: def.weight,
    });
  }

  const final =
    totalWeight > 0 ? totalScore / totalWeight : 0;

  return {
    score: Math.round(final * 100) / 100,
    breakdown,
  };
}
