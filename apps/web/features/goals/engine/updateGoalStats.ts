import { GoalStats } from "../models/GoalStats";
import { Goal } from "../models/Goal";
import { explainGoal } from "./explainGoal";

export async function updateGoalStats(userId: string) {
    const goals = await Goal.find({ userId }).lean();

    for (const goal of goals) {
        const isFinite = goal.nature === "finite_deliverable";

        if (isFinite) {
            // ============================================================
            // Finite Deliverable Goal Engine
            // Progress = verified completion % of milestones or tasks.
            // Invariant 10: Scheduling confers 0% progress; verified completion confers progress.
            // ============================================================
            const { Task } = await import("@/server/db/models/Task");
            const linkedTasks = await Task.find({ userId, goalId: goal._id }).lean();
            const totalTasks = linkedTasks.length;
            const completedTasks = linkedTasks.filter((t: any) => t.status === "completed").length;

            const milestones = (goal.milestones || []).map((m: any) => ({ ...m }));
            const totalMilestones = milestones.length;
            let completedMilestones = 0;

            for (const m of milestones) {
                if (m.linkedTaskId) {
                    const task = linkedTasks.find((t: any) => t._id.toString() === m.linkedTaskId);
                    if (task && task.status === "completed") {
                        m.completed = true;
                        if (!m.completedAt) m.completedAt = task.completedAt || new Date();
                    }
                }
                if (m.completed) {
                    completedMilestones++;
                }
            }

            let progressPercent = 0;
            if (totalMilestones > 0) {
                progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
            } else if (totalTasks > 0) {
                progressPercent = Math.round((completedTasks / totalTasks) * 100);
            }

            const isCompleted = progressPercent === 100 && (totalMilestones > 0 || totalTasks > 0);
            const newState = isCompleted ? "completed" : progressPercent >= 75 ? "on_track" : progressPercent >= 40 ? "slow" : "stalled";

            if (isCompleted && goal.status !== "completed") {
                await Goal.updateOne(
                    { _id: goal._id },
                    {
                        status: "completed",
                        deliverableProgressPercent: 100,
                        confirmedAt: new Date(),
                        milestones,
                    }
                );
            } else {
                await Goal.updateOne(
                    { _id: goal._id },
                    {
                        deliverableProgressPercent: progressPercent,
                        milestones,
                    }
                );
            }

            const stats = await GoalStats.findOne({ goalId: goal._id });
            const bestScore = Math.max(stats?.bestScoreEver || 0, progressPercent);

            await GoalStats.findOneAndUpdate(
                { goalId: goal._id },
                {
                    nature: "finite_deliverable",
                    currentScore: progressPercent,
                    deliverableProgressPercent: progressPercent,
                    completedMilestonesCount: completedMilestones,
                    totalMilestonesCount: totalMilestones,
                    completedTasksCount: completedTasks,
                    totalTasksCount: totalTasks,
                    state: newState,
                    bestScoreEver: bestScore,
                    lastEvaluatedAt: new Date(),
                },
                { upsert: true }
            );
            continue;
        }

        // ============================================================
        // Habitual Cadence Goal Engine
        // Health = 14-day rolling signal consistency.
        // Cadence goals remain active without artificial completion.
        // ============================================================
        const explanation = await explainGoal(goal, userId);
        
        let totalWeight = 0;
        let earnedScore = 0;

        for (const signal of explanation.signals) {
            const w = signal.weight || 1;
            totalWeight += w * 14; // Max possible score over 14 days
            earnedScore += signal.activeDays * w;
        }

        const currentScore = totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;

        let currentStreak = 0;
        for (let i = 13; i >= 0; i--) {
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
                nature: "habitual_cadence",
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

