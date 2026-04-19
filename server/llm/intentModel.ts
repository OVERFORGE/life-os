// ============================================================
// 🎯 DETERMINISTIC INTENT CLASSIFIER — NO LLM
// Rules-based engine. Zero token cost, zero hallucination risk.
// ============================================================

export function detectIntent(input: string, _history: string = "", _model?: string): { intent: string, confidence: number } {
    const msg = input.toLowerCase();

    // ── DELETE GOAL ──────────────────────────────────────────
    // Must check before create_goal since "delete" is unambiguous
    if (
        (msg.includes("delete") || msg.includes("remove") || msg.includes("drop") || msg.includes("kill") || msg.includes("destroy")) &&
        (msg.includes("goal") || msg.includes("habit") || msg.includes("objective"))
    ) {
        return { intent: "delete_goal", confidence: 1.0 };
    }

    // ── CREATE GOAL ──────────────────────────────────────────
    if (
        (msg.includes("create") || msg.includes("set up") || msg.includes("make a goal") || msg.includes("start tracking") || msg.includes("add a goal") || msg.includes("new goal")) &&
        (msg.includes("goal") || msg.includes("habit") || msg.includes("track") || msg.includes("signal"))
    ) {
        return { intent: "create_goal", confidence: 1.0 };
    }

    // ── CONFIRM GOAL ─────────────────────────────────────────
    // Fires when user is responding to a pending proposal
    const hasPendingProposals = _history.includes("pending goal proposals");
    if (hasPendingProposals) {
        const confirmKeywords = ["yes", "yeah", "yep", "looks good", "go ahead", "do it", "create it", "make it", "sure", "ok do it", "perfect", "that works", "confirmed", "approve"];
        const modifyKeywords  = ["change", "modify", "update", "instead", "adjust", "make it", "rename", "call it", "different", "use", "add signal", "remove signal"];
        if (confirmKeywords.some(kw => msg.includes(kw)) || modifyKeywords.some(kw => msg.includes(kw))) {
            return { intent: "confirm_goal", confidence: 0.9 };
        }
    }

    // ── LOG ACTIVITY ─────────────────────────────────────────
    // Physical actions, mental overrides, sleep/wake, numeric habits
    const activityKeywords = [
        "slept", "sleep at", "slept at", "went to bed", "going to bed", "sleep time", "going to sleep",
        "woke up", "wake up", "woke", "waked",
        "gym", "workout", "worked out", "exercised", "trained",
        "read", "reading", "pages",
        "meditat", "mindful",
        "worked", "deep work", "focus hours", "hours of work", "hours of focus",
        "mood", "stress", "energy", "anxiety", "focus is", "set my mood", "change my mood",
        "change my stress", "set my stress", "my energy is", "i feel", "i'm feeling",
        "calories", "ate", "drank", "water", "steps", "walked",
        "ran", "running", "jogged", "stretch",
        "i went", "i did", "i completed", "i finished", "i had", "i got",
    ];
    if (activityKeywords.some(kw => msg.includes(kw))) {
        return { intent: "log_activity", confidence: 1.0 };
    }

    // ── GET INSIGHTS ─────────────────────────────────────────
    const insightKeywords = [
        "last week", "last month", "last 30", "past 7", "past week", "past month",
        "my stats", "show me", "how have i been", "am i improving", "trend",
        "average", "history", "data", "summary", "progress report",
    ];
    if (insightKeywords.some(kw => msg.includes(kw))) {
        return { intent: "get_insights", confidence: 1.0 };
    }

    // ── ASK ADVICE ───────────────────────────────────────────
    const adviceKeywords = [
        "what should i", "how should i", "what do you recommend", "any advice",
        "help me improve", "how can i", "what can i do", "tips for",
        "how to improve", "suggest", "recommendation",
    ];
    if (adviceKeywords.some(kw => msg.includes(kw))) {
        return { intent: "ask_advice", confidence: 1.0 };
    }

    // ── DEFAULT ──────────────────────────────────────────────
    return { intent: "casual_chat", confidence: 0.8 };
}
