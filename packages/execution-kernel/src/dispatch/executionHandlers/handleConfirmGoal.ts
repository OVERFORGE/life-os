import { GoalProposal } from "@/server/db/models/GoalProposal";
import { handleCreateGoal } from "./handleCreateGoal";
import { cleanLLMResponse } from "../../shared/groq";
import { invokeLifeOSChat } from "../../shared/langchain/LifeOSChatModel";
import { upsertCatalogDocWithOutbox } from "@/features/catalog/services/catalogMutationEngine";

export interface ConfirmGoalPayload {
    action?: "confirm" | "reject" | "modify";
    updates?: Record<string, any>;
    goalId?: string;
    modificationInstructions?: string;
}

export async function handleConfirmGoal(input: string | ConfirmGoalPayload, userId: string, model?: string) {
    // Load the most recent pending proposal
    const pending = await GoalProposal.findOne({ userId, status: "pending" }).sort({ createdAt: -1 });

    if (!pending) {
        return {
            type: "confirm_goal",
            success: false,
            error: "No pending goal proposal found. Please describe the goal you want to create first.",
        };
    }

    const structuredInput: ConfirmGoalPayload =
        typeof input === "string"
            ? { action: "confirm" }
            : input || { action: "confirm" };

    if (structuredInput.action === "reject") {
        await upsertCatalogDocWithOutbox({
            userId,
            model: GoalProposal,
            filter: { _id: pending._id, userId },
            aggregateType: "goal_proposal",
            eventType: "domain.goal_proposal.updated",
            domain: "goals",
            updateFields: { status: "rejected" },
            options: { source: "kernel.confirm_goal.reject" },
        });
        return {
            type: "confirm_goal",
            success: true,
            data: { rejected: true, ai_instruction: "Pending goal proposal cancelled." },
        };
    }

    if (structuredInput.action === "modify") {
        const modificationSummary =
            structuredInput.modificationInstructions ||
            JSON.stringify(structuredInput.updates || {});
        // Let LLM merge the structured changes into the existing proposal
        const mergePrompt = `
You are updating an existing goal proposal based on structured user changes.

Existing Proposal:
${JSON.stringify(pending.proposal, null, 2)}

Requested Changes: ${modificationSummary}

Apply ONLY the specified changes. Keep everything else the same.
Return the full updated proposal as strict JSON:
{
  "title": "...",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible",
  "signals": [...],
  "newSignals": [ { "label": "...", "inputType": "number" | "checkbox" | "time", "categoryKey": "work" | "habits" | "physical", "weight": 5 } ],
  "description": "..."
}
`;
        try {
            const res = await invokeLifeOSChat({ messages: [{ role: "user", content: mergePrompt }], temperature: 0, model });
            const merged = JSON.parse(cleanLLMResponse(res));
            await upsertCatalogDocWithOutbox({
                userId,
                model: GoalProposal,
                filter: { _id: pending._id, userId },
                aggregateType: "goal_proposal",
                eventType: "domain.goal_proposal.updated",
                domain: "goals",
                updateFields: { proposal: merged, status: "pending" },
                options: { source: "kernel.confirm_goal.modify" },
            });
            pending.proposal = merged;
            pending.status = "pending"; // keep pending

            return {
                type: "confirm_goal",
                success: true,
                data: {
                    updated: true,
                    proposal: pending.proposal,
                    ai_instruction: `The goal proposal has been updated based on the user's changes. Present the UPDATED proposal: Title: "${pending.proposal.title}", Signals: ${[...(pending.proposal.signals || []), ...(pending.proposal.newSignals?.map((s: any) => `${s.label}`) || [])].join(", ")}. Ask again: "Does this look good now? Say yes to create it."`,
                },
            };
        } catch (e: any) {
            return { type: "confirm_goal", success: false, error: "Failed to apply changes: " + e.message };
        }
    }

    // User confirmed — create the goal from the proposal
    const result = await handleCreateGoal(pending.proposal, userId);

    if (result.success) {
        await upsertCatalogDocWithOutbox({
            userId,
            model: GoalProposal,
            filter: { _id: pending._id, userId },
            aggregateType: "goal_proposal",
            eventType: "domain.goal_proposal.updated",
            domain: "goals",
            updateFields: { status: "confirmed" },
            options: { source: "kernel.confirm_goal.confirm" },
        });
        return {
            ...result,
            type: "confirm_goal",
            data: {
                ...result.data,
                ai_instruction: `SUCCESS. The goal "${pending.proposal.title}" has been officially created and is now active in the system. Confirm this clearly to the user and encourage them to start tracking.`,
            },
        };
    }

    return result;
}
