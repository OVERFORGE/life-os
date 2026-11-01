import mongoose from "mongoose";
import { OutboxStorageService, OutboxEventDraft } from "../../events/persistence/OutboxStorageService";
import { LifeSignal } from "@/features/signals/models/LifeSignal";
import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";

export async function handleCreateGoal(
    payload: any,
    userId: string,
    goalModel: any = Goal,
    outboxService: OutboxStorageService = OutboxStorageService.getInstance()
) {
    console.log("CREATE GOAL PAYLOAD:", payload);

    const finalSignals = [...(payload.signals || [])];
    const signalWeights = new Map<string, number>();

    if (payload.newSignals && payload.newSignals.length > 0) {
        for (const ns of payload.newSignals) {
            const key = ns.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
            await LifeSignal.findOneAndUpdate(
                { userId, key },
                { 
                  label: ns.label, 
                  inputType: ns.inputType || "number", 
                  categoryKey: ns.categoryKey || "habits", // Default category to habits so it appears on mobile
                  enabled: true 
                },
                { upsert: true }
            );
            if (!finalSignals.includes(key)) finalSignals.push(key);
            signalWeights.set(key, ns.weight || 5);
        }
    }

    const formattedSignals = finalSignals.map(key => ({ 
        key, 
        weight: signalWeights.get(key) || 5, // Default weight of 5 instead of 1
        direction: "higher_better" 
    }));

    let goal: any;
    const goalId = new mongoose.Types.ObjectId();
    const clientMutationId = `mut_goal_create_${goalId}_${Date.now()}`;
    const diffHash = `diff_goal_create_${goalId}_1`;

    const domainUpdates = {
        title: payload.title,
        type: payload.type || "maintenance",
        cadence: payload.cadence || "daily",
        status: payload.status || "active",
        signals: formattedSignals,
        userId: userId.toString(),
    };

    const eventDraft: OutboxEventDraft = {
        userId: String(userId),
        category: "DOMAIN_EVENT",
        type: "domain.goal.created",
        aggregateId: String(goalId),
        aggregateType: "goal",
        aggregateVersion: 1,
        source: "kernel.goal.create",
        payload: {
            goalId: String(goalId),
            userId: String(userId),
            title: payload.title,
            nature: (payload.type === "deliverable" || payload.nature === "finite_deliverable") ? "finite_deliverable" : "habitual_cadence",
            targetDate: payload.targetDate,
        },
        occurredAt: new Date(),
    };

    try {
        await outboxService.persistWithStandaloneFencing({
            userId: String(userId),
            aggregateModel: goalModel,
            aggregateId: String(goalId),
            clientMutationId,
            diffHash,
            expectedVersion: 0,
            fencingEpoch: 0,
            domainUpdates,
            eventDrafts: [eventDraft],
            isCreation: true,
        });
        goal = await goalModel.findById(goalId);
    } catch (err: any) {
        if (err?.code === 11000) {
            throw new Error(`DUPLICATE_DETECTED: An active goal "${payload.title}" already exists.`);
        }
        throw err;
    }

    try {
        if (goalModel === Goal) {
            await evaluateGoal(goal);
        }
    } catch (evalErr) {
        console.warn("[handleCreateGoal] evaluateGoal non-blocking error:", evalErr);
    }
    return {
        type: "create_goal",
        success: true,
        goalId: goal._id.toString(),
        title: goal.title,
        goal,
        targetEntity: {
            entityId: goal._id.toString(),
            displayName: goal.title,
            entityType: "goal" as const,
            domain: "productivity" as const,
            status: goal.status,
        },
        data: {
            goalId: goal._id.toString(),
            title: goal.title,
            goal,
        },
    };
}
