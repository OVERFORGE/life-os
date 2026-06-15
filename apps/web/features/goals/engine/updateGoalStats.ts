import { GoalStats } from "../models/GoalStats";
import { Goal } from "../models/Goal";
import { explainGoal } from "./explainGoal";

export async function updateGoalStats(userId: string) {
    const goals = await Goal.find({ userId }).lean();

    for (const goal of goals) {
        // We reuse the existing explainGoal engine which extracts activeDays and values
        // over the last 14 days for all tracked signals.
        const explanation = await explainGoal(goal, userId);
        
        let totalWeight = 0;
        let earnedScore = 0;

        for (const signal of explanation.signals) {
            const w = signal.weight || 1;
            totalWeight += w * 14; // Max possible score over 14 days
            earnedScore += signal.activeDays * w;
        }

        const currentScore = totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;

        // Calculate a simple current streak
        // Check the most recent day in the values array across all signals
        let currentStreak = 0;
        for (let i = 13; i >= 0; i--) {
            // If at least one signal was active on this day, count it as a streak day
            const isActiveDay = explanation.signals.some((s: any) => s.values[i] > 0);
            if (isActiveDay) {
                currentStreak++;
            } else {
                break;
            }
        }

        let state = "on_track";
        if (currentScore < 30) state = "stalled";
        else if (currentScore < 60) state = "drifting";
        else if (currentScore < 80) state = "slow";

        const stats = await GoalStats.findOne({ goalId: goal._id });
        const bestScore = Math.max(stats?.bestScoreEver || 0, currentScore);
        const bestStreak = Math.max(stats?.bestStreakEver || 0, currentStreak);

        await GoalStats.findOneAndUpdate(
            { goalId: goal._id },
            {
                currentScore,
                currentStreak,
                state,
                bestScoreEver: bestScore,
                bestStreakEver: bestStreak,
                lastEvaluatedAt: new Date()
            },
            { upsert: true }
        );
    }
}
