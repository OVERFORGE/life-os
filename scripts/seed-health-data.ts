/**
 * Seed realistic 5-week health data for testing the weight trend & maintenance calorie charts.
 * Run: npx tsx -r dotenv/config scripts/seed-health-data.ts
 */
import 'dotenv/config';
import { connectDB } from '../server/db/connect';
import { WeightLog } from '../server/db/models/WeightLog';
import { NutritionLog } from '../server/db/models/NutritionLog';
import mongoose from 'mongoose';

const USER_ID = '697262fb0c80b5f356034a42';

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

async function main() {
  await connectDB();
  const uid = new mongoose.Types.ObjectId(USER_ID);

  console.log('Seeding weight logs (Sundays, 5 weeks)...');

  // Weight: realistic slow cut, ~0.3kg/week loss
  const weightSundays = [
    { daysAgo: 35, weight: 94.5 },
    { daysAgo: 28, weight: 94.1 },
    { daysAgo: 21, weight: 93.6 },
    { daysAgo: 14, weight: 93.2 },
    { daysAgo: 7,  weight: 92.8 },
    { daysAgo: 0,  weight: 92.5 },
  ];

  for (const entry of weightSundays) {
    const date = dateStr(entry.daysAgo);
    await WeightLog.findOneAndUpdate(
      { userId: uid, date },
      { userId: uid, date, weight: entry.weight },
      { upsert: true, new: true }
    );
    console.log(`  WeightLog: ${date} → ${entry.weight}kg`);
  }

  console.log('\nSeeding daily calorie logs (35 days)...');

  // Calorie pattern: weekdays ~2100-2400, weekends ~2500-2900
  for (let daysAgo = 35; daysAgo >= 1; daysAgo--) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const date = dateStr(daysAgo);

    // Realistic calorie variance
    const baseCals = isWeekend ? rand(2450, 2850) : rand(2050, 2400);

    // Don't override existing real logs
    const existing = await NutritionLog.findOne({ userId: uid, date });
    if (existing && existing.meals && existing.meals.length > 0) {
      console.log(`  Skipping ${date} — real data exists (${existing.dailyTotals?.calories} kcal)`);
      continue;
    }

    // Fake macros at roughly: 25% protein, 45% carbs, 30% fat
    const protein = Math.round(baseCals * 0.25 / 4); // 4 kcal/g
    const carbs   = Math.round(baseCals * 0.45 / 4);
    const fats    = Math.round(baseCals * 0.30 / 9); // 9 kcal/g

    await NutritionLog.findOneAndUpdate(
      { userId: uid, date },
      {
        userId: uid,
        date,
        meals: [], // No fake individual meals — just totals
        dailyTotals: { calories: baseCals, protein, carbs, fats },
      },
      { upsert: true, new: true }
    );
    console.log(`  NutritionLog: ${date} → ${baseCals} kcal (${isWeekend ? 'weekend' : 'weekday'})`);
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
