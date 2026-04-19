import { LifeSignal } from "@/features/signals/models/LifeSignal";
import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";

export async function handleCreateGoal(payload: any, userId: string) {
    console.log("CREATE GOAL PAYLOAD:", payload);

    const finalSignals = [...(payload.signals || [])];

    if (payload.newSignals && payload.newSignals.length > 0) {
        for (const ns of payload.newSignals) {
            const key = ns.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
            await LifeSignal.findOneAndUpdate(
                { userId, key },
                { label: ns.label, inputType: ns.inputType || "number", enabled: true },
                { upsert: true }
            );
            if (!finalSignals.includes(key)) finalSignals.push(key);
        }
    }

    const formattedSignals = finalSignals.map(key => ({ key, weight: 1, direction: "higher_better" }));

    const goal = await Goal.create({
        title: payload.title,
        type: payload.type || "maintenance",
        cadence: payload.cadence || "daily",
        signals: formattedSignals,
        userId,
    });

    await evaluateGoal({ goal, userId });
    return { type: "create_goal", success: true, data: { title: goal.title } };
}
