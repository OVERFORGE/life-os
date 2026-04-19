import { GoalProposal } from "@/server/db/models/GoalProposal";
import { handleCreateGoal } from "./handleCreateGoal";
import { groqChat, cleanLLMResponse } from "@/server/llm/groq";

export async function handleConfirmGoal(userMessage: string, userId: string, model?: string) {
    // Load the most recent pending proposal
    const pending = await GoalProposal.findOne({ userId, status: "pending" }).sort({ createdAt: -1 });

    if (!pending) {
        return {
            type: "confirm_goal",
            success: false,
            error: "No pending goal proposal found. Please describe the goal you want to create first.",
        };
    }

    // Check if the user is requesting modifications, not just confirming
    const isModification = /change|modify|update|instead|adjust|make it|rename|call it|different|use|add|remove/i.test(userMessage);

    if (isModification) {
        // Let LLM merge the user's changes into the existing proposal
        const mergePrompt = `
You are updating an existing goal proposal based on the user's requested changes.

Existing Proposal:
${JSON.stringify(pending.proposal, null, 2)}

User's Requested Changes: "${userMessage}"

Apply ONLY the changes the user specified. Keep everything else the same.
Return the full updated proposal as strict JSON:
{
  "title": "...",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible",
  "signals": [...],
  "newSignals": [ { "label": "...", "inputType": "number" | "checkbox" | "time" } ],
  "description": "..."
}
`;
        try {
            const res = await groqChat({ messages: [{ role: "user", content: mergePrompt }], temperature: 0, model });
            const merged = JSON.parse(cleanLLMResponse(res));
            pending.proposal = merged;
            pending.status = "pending"; // keep pending
            await pending.save();

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
        await GoalProposal.findByIdAndUpdate(pending._id, { status: "confirmed" });
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
