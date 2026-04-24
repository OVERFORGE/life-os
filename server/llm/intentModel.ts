// ============================================================
// 🎯 DETERMINISTIC INTENT CLASSIFIER — NO LLM
// Rules-based engine. Zero token cost, zero hallucination risk.
// ============================================================

export function detectIntent(input: string, _history: string = "", _model?: string, hasPendingProposal: boolean = false): { intent: string, confidence: number } {
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
    // Fires when there is a real pending GoalProposal in the DB
    if (hasPendingProposal) {
        const confirmKeywords = ["yes", "yeah", "yep", "looks good", "go ahead", "do it", "create it", "make it", "sure", "ok", "perfect", "that works", "confirmed", "approve", "fine", "correct", "sounds good"];
        const modifyKeywords  = ["change", "modify", "update", "instead", "adjust", "make it", "rename", "call it", "different", "use", "add signal", "remove signal"];
        if (confirmKeywords.some(kw => msg.includes(kw)) || modifyKeywords.some(kw => msg.includes(kw))) {
            return { intent: "confirm_goal", confidence: 0.9 };
        }
    }

    // ── DIET MODE ─────────────────────────────────────────────
    // Must be before log_meal and ask_advice to catch mode-switch intents
    const dietModeSwitchKeywords = [
        "switch to bulk", "switch to cut", "switch to recomp", "switch to slight",
        "want to bulk", "want to cut", "want to recomp", "want to maintain",
        "start bulking", "start cutting", "start a cut", "start a bulk",
        "put me on a", "put me in a", "go on a bulk", "go on a cut",
        "lean bulk", "aggressive cut", "calorie surplus", "calorie deficit",
        "i want to lose weight", "i want to gain muscle", "change my diet mode",
        "change my diet plan", "update my diet mode", "update my diet",
        "change my calorie target", "set my diet", "diet mode",
    ];
    if (dietModeSwitchKeywords.some(kw => msg.includes(kw))) {
        return { intent: "propose_diet_mode", confidence: 1.0 };
    }

    // Detect confirmation of a pending diet mode proposal
    const dietConfirmKeywords = ["yes", "yeah", "yep", "go ahead", "do it", "confirm", "sure", "ok", "perfect", "that works", "sounds good", "apply it", "use that"];
    const isProbablyDietConfirm = (
        dietConfirmKeywords.some(kw => msg.includes(kw)) &&
        (msg.includes("calorie") || msg.includes("kcal") || msg.includes("target") || msg.includes("diet") || msg.includes("bulk") || msg.includes("cut") || msg.length < 40)
    );
    if (isProbablyDietConfirm) {
        return { intent: "confirm_diet_mode", confidence: 0.8 };
    }


    // ── ASK ADVICE / HEALTH QUERY ────────────────────────────
    // MUST run before log_meal/log_activity so question phrases beat action keywords
    const adviceKeywords = [
        "what should i", "how should i", "what do you recommend", "any advice",
        "help me improve", "how can i", "what can i do", "tips for",
        "how to improve", "suggest", "recommendation",
        // Health/calorie queries that need real data context:
        "am i in a deficit", "am i eating enough", "how is my diet", "how many calories",
        "how's my diet", "what did i eat", "my calorie", "deficit", "surplus",
        "how many cal", "calories have i", "calorie count", "have i had today",
    ];
    if (adviceKeywords.some(kw => msg.includes(kw))) {
        return { intent: "ask_advice", confidence: 1.0 };
    }

    // ── LOG WEIGHT ───────────────────────────────────────────
    // Must be before log_activity to prevent "weigh" being grabbed by generic keywords
    if (
        msg.match(/\d+\s*(kg|lbs|pounds|kilos)/) ||
        msg.includes("i weigh") || msg.includes("my weight") || msg.includes("weighed myself") ||
        msg.includes("today i'm") && msg.match(/\d+(kg|lbs)/)
    ) {
        return { intent: "log_activity", confidence: 1.0 }; // Routes to log_activity intent but extractor will create update_weight action
    }

    // ── LOG MEAL ─────────────────────────────────────────────
    if (
        msg.includes("i ate") || msg.includes("just ate") || msg.includes("i had") ||
        msg.includes("i've eaten") || msg.includes("i'm eating") ||
        (msg.includes("log") && (msg.includes("meal") || msg.includes("food") || msg.includes("diet") || msg.includes("template"))) ||
        (msg.includes("apply") && msg.includes("template"))
    ) {
        return { intent: "log_activity", confidence: 1.0 }; // Routes to log_activity intent but extractor will create log_meal action
    }

    // ── ASK ADVICE / HEALTH QUERY (duplicate block removed — moved above) ──

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
        "drank", "water", "steps", "walked",
        "ran", "running", "jogged", "stretch",
        "i went", "i did", "i completed", "i finished", "i got",
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

    // ── DEFAULT ──────────────────────────────────────────────
    return { intent: "casual_chat", confidence: 0.8 };
}
