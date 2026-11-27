import { cleanLLMResponse } from "../../shared/groq";
import { invokeLifeOSChat } from "../../shared/langchain/LifeOSChatModel";
import { GoalProposal } from "@/server/db/models/GoalProposal";
import { LifeSignal } from "@/features/signals/models/LifeSignal";
import {
    createCatalogDocWithOutbox,
    upsertCatalogDocWithOutbox,
} from "@/features/catalog/services/catalogMutationEngine";

export async function handleProposeGoal(userMessage: string, userId: string, model?: string) {
    // Get existing tracked signals so the LLM can suggest ones that already exist
    const existingSignals = await LifeSignal.find({ userId, enabled: true })
        .select("key label inputType")
        .lean();
    const existingList = existingSignals.map(s => `${s.key} (${s.label}, ${s.inputType})`).join(", ");

    const prompt = `
You are a goal structure designer for a behavioral tracking system. 
Based on the user's goal request, draft a structured goal proposal.

User Request: "${userMessage}"
User's Existing Tracked Signals: [${existingList || "none yet"}]

CRITICAL INSTRUCTIONS:
1. Re-use existing signals whenever possible!
2. If you absolutely MUST create new tracking signals, keep them concise and fundamental (Max 1 or 2). DO NOT create redundant signals with same meanings.
3. For any "newSignals", you MUST assign them a valid categoryKey: "work", "habits", or "physical". If it's a mental state, use "habits".
4. Assign reasonable weights to signals based on importance (1 to 10).

Return strict JSON only:
{
  "title": "Actionable goal title",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible",
  "signals": ["existing_signal_keys_to_attach"],
  "newSignals": [
    { "label": "Human readable name", "inputType": "number" | "checkbox" | "time", "categoryKey": "work" | "habits" | "physical", "weight": 5 }
  ],
  "description": "One sentence summary of what will be tracked and why"
}
`;

    try {
        const res = await invokeLifeOSChat({ messages: [{ role: "user", content: prompt }], temperature: 0, model });
        const cleanRes = cleanLLMResponse(res);
        const parsed = JSON.parse(cleanRes);

        // Cancel any previous pending proposals for this user via outbox
        const priorPendings = await GoalProposal.find({ userId, status: "pending" }).select("_id").lean();
        for (const p of priorPendings) {
            await upsertCatalogDocWithOutbox({
                userId,
                model: GoalProposal,
                filter: { _id: (p as any)._id, userId },
                aggregateType: "goal_proposal",
                eventType: "domain.goal_proposal.updated",
                domain: "goals",
                updateFields: { status: "rejected" },
                options: { source: "kernel.propose_goal.supersede" },
            });
        }

        // Save new pending proposal via outbox
        const createdRes = await createCatalogDocWithOutbox({
            userId,
            model: GoalProposal,
            aggregateType: "goal_proposal",
            eventType: "domain.goal_proposal.updated",
            domain: "goals",
            docFields: {
                userId,
                status: "pending",
                proposal: {
                    title: parsed.title,
                    type: parsed.type || "maintenance",
                    cadence: parsed.cadence || "daily",
                    signals: parsed.signals || [],
                    newSignals: parsed.newSignals || [],
                    description: parsed.description || "",
                },
            },
            options: { source: "kernel.propose_goal" },
        });
        const saved = createdRes.doc;

        console.log("📝 [PROPOSE GOAL] Saved pending proposal:", JSON.stringify(saved.proposal));

        return {
            type: "propose_goal",
            success: true,
            data: {
                proposal: saved.proposal,
                pendingId: saved._id.toString(),
                ai_instruction: `Present this goal proposal to the user CLEARLY. Title: "${saved.proposal.title}". Type: ${saved.proposal.type}. Cadence: ${saved.proposal.cadence}. Signals to track: ${[...(saved.proposal.signals || []), ...(saved.proposal.newSignals?.map((s: any) => `${s.label} (${s.inputType})`) || [])].join(", ")}. Description: "${saved.proposal.description}". Ask the user: "Does this look right? Want to adjust anything before I create it? Just say yes or describe your changes."`,
            },
        };
    } catch (e: any) {
        console.error("PROPOSE GOAL ERROR:", e);
        return { type: "propose_goal", success: false, error: e.message };
    }
}
