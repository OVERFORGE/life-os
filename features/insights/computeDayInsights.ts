import { ConversationMessage } from "@/server/db/models/ConversationMessage";
import { DailyLog } from "@/server/db/models/DailyLog";

/* ===================================================== */
/* 🧠 HELPER: EXTRACT HOURS                              */
/* ===================================================== */

function parseTime(time: string) {
    if (!time) return null;

    const match = time.match(/(\d{1,2})(:\d{2})?(AM|PM)/i);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2].replace(":", "")) : 0;
    const period = match[3].toUpperCase();

    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    return hour + minute / 60;
}

/* ===================================================== */
/* 🧠 SLEEP CALCULATION                                  */
/* ===================================================== */

function calculateSleepHours(wake: string, sleep: string) {
    const wakeH = parseTime(wake);
    const sleepH = parseTime(sleep);

    if (wakeH === null || sleepH === null) return null;

    let diff = wakeH - sleepH;

    if (diff < 0) diff += 24;

    return Math.round(diff);
}

/* ===================================================== */
/* 🧠 SIMPLE HEURISTIC SCORING                           */
/* ===================================================== */

function analyzeMessages(messages: string[]) {
    let mood = 5;
    let energy = 5;
    let stress = 5;

    const text = messages.join(" ").toLowerCase();

    /* ===== mood ===== */
    if (text.includes("good") || text.includes("productive")) mood += 2;
    if (text.includes("bad") || text.includes("tired")) mood -= 2;

    /* ===== energy ===== */
    if (text.includes("gym") || text.includes("worked")) energy += 2;
    if (text.includes("lazy") || text.includes("sleepy")) energy -= 2;

    /* ===== stress ===== */
    if (text.includes("stress") || text.includes("pressure")) stress += 2;
    if (text.includes("calm") || text.includes("relaxed")) stress -= 2;

    return {
        mood: Math.max(1, Math.min(10, mood)),
        energy: Math.max(1, Math.min(10, energy)),
        stress: Math.max(1, Math.min(10, stress)),
    };
}

/* ===================================================== */
/* 🧠 MAIN FUNCTION                                      */
/* ===================================================== */

export async function computeDayInsights({
    userId,
    date,
    session,
}: {
    userId: string;
    date: string;
    session: any;
}) {
    try {
        /* ================= GET MESSAGES ================= */

        const messages = await ConversationMessage.find({
            userId,
            createdAt: {
                $gte: new Date(date),
                $lte: new Date(date + "T23:59:59"),
            },
        }).lean();

        const texts = messages.map((m) => m.content || "");

        /* ================= ANALYSIS ================= */

        const mental = analyzeMessages(texts);

        /* ================= SLEEP ================= */

        let sleepHours = null;

        if (session?.wakeTime && session?.sleepTime) {
            sleepHours = calculateSleepHours(
                session.wakeTime,
                session.sleepTime
            );
        }

        /* ================= UPDATE LOG ================= */

        const log = await DailyLog.findOne({ userId, date });

        if (!log) return;

        /* ================= STRUCTURED ================= */

        log.mental = {
            mood: mental.mood,
            energy: mental.energy,
            stress: mental.stress,
        };

        /* ================= SIGNALS ================= */



        /* also update signals */

        if (!(log.signals instanceof Map)) {
            log.signals = new Map(Object.entries(log.signals || {}));
        }

        log.signals.set("mood", mental.mood);
        log.signals.set("energy", mental.energy);
        log.signals.set("stress", mental.stress);

        log.sleep = log.sleep || {};
        log.sleep.hours = sleepHours;
        if (sleepHours !== null) {
            log.signals.set("sleepHours", sleepHours);
        }

        await log.save();

        console.log("🧠 Insights computed:", mental, sleepHours);

        return {
            mental,
            sleepHours,
        };
    } catch (err) {
        console.error("INSIGHT ERROR:", err);
    }
}