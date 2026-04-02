import { LifeSignal } from "@/features/signals/models/LifeSignal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { DailySession } from "@/features/dailySession/models/DailySession";
import { computeDayInsights } from "@/features/insights/computeDayInsights";
/* ===================================================== */
/* 🧠 HELPERS                                            */
/* ===================================================== */

function resolveExplicitDate(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("yesterday")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  return null;
}

function extractSleepTime(message: string) {
  const match = message.match(/(sleep|slept).*?(\d{1,2})(:\d{2})?\s?(am|pm)/i);
  if (!match) return null;

  return `${match[2]}${match[3] || ""}${match[4].toUpperCase()}`;
}

function extractWakeTime(message: string) {
  const match = message.match(/(wake|woke).*?(\d{1,2})(:\d{2})?\s?(am|pm)/i);
  if (!match) return null;

  return `${match[2]}${match[3] || ""}${match[4].toUpperCase()}`;
}

function extractDuration(message: string) {
  const match = message.match(/(\d+)\s*(hour|hr|hrs)/i);
  return match ? Number(match[1]) : 1;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

/* ===================================================== */
/* 🧠 MAIN EXECUTOR                                      */
/* ===================================================== */

export async function executeTool({
  tool,
  message,
  context,
  userId,
}: {
  tool: string | null;
  message: string;
  context: any;
  userId: string;
}) {
  if (tool !== "log_activity") return null;

  try {
    const lower = message.toLowerCase();

    /* ===================================================== */
    /* 🟢 SESSION (ACTIVE SESSION MODE)                     */
    /* ===================================================== */

    let session = await DailySession.findOne({
      userId,
      isComplete: false,
    }).sort({ createdAt: -1 });

    const explicitDate = resolveExplicitDate(message);

    if (!session) {
      session = await DailySession.create({
        userId,
        date:
          explicitDate ||
          new Date().toISOString().split("T")[0],
        isComplete: false,
      });

      console.log("🆕 New session created:", session.date);
    }

    const finalDate = session.date;

    /* ===================================================== */
    /* 🧠 TIME HANDLING                                     */
    /* ===================================================== */

    const sleepTime = extractSleepTime(message);
    const wakeTime = extractWakeTime(message);

    if (wakeTime) {
      session.wakeTime = wakeTime;
      console.log("🌅 Wake time set:", wakeTime);
    }



    if (sleepTime) {
      session.sleepTime = sleepTime;
      session.isComplete = true;

      console.log("🛑 Session completed:", finalDate, sleepTime);

      await session.save();

      /* 🔥 NEW: COMPUTE INSIGHTS */
      await computeDayInsights({
        userId,
        date: finalDate,
        session,
      });
    }

    await session.save();

    /* ===================================================== */
    /* 🧠 FETCH SIGNALS                                    */
    /* ===================================================== */

    const signals = await LifeSignal.find({
      userId,
      enabled: true,
    }).lean();

    /* ===================================================== */
    /* 🧠 GET OR CREATE LOG                                 */
    /* ===================================================== */

    let log = await DailyLog.findOne({ userId, date: finalDate });

    if (!log) {
      log = await DailyLog.create({
        userId,
        date: finalDate,
        signals: {},
      });

      console.log("🆕 New log created:", finalDate);
    }

    /* ensure Map */
    if (!(log.signals instanceof Map)) {
      log.signals = new Map(Object.entries(log.signals || {}));
    }

    /* ===================================================== */
    /* 🧠 MATCH ENGINE                                      */
    /* ===================================================== */

    let matchedSomething = false;

    for (const sig of signals) {
      const key = sig.key;
      const keyLower = key.toLowerCase();
      const labelLower = sig.label.toLowerCase();

      const normalizedMessage = normalize(lower);
      const normalizedKey = normalize(keyLower);
      const normalizedLabel = normalize(labelLower);

      const match =
        normalizedMessage.includes(normalizedKey) ||
        normalizedMessage.includes(normalizedLabel);

      const noFapMatch =
        keyLower.includes("nofap") &&
        (lower.includes("didnt fap") ||
          lower.includes("didn't fap") ||
          lower.includes("no fap"));

      if (!match && !noFapMatch) continue;

      matchedSomething = true;

      let value = 1;

      if (sig.inputType !== "checkbox") {
        value = extractDuration(lower);
      }

      const prev = Number(log.signals.get(key) || 0);

      const finalValue =
        sig.inputType === "checkbox"
          ? 1
          : prev + value;

      log.signals.set(key, finalValue);

      /* structured mapping */
      const parts = key.split(".");

      if (parts.length === 2) {
        const [group, sub] = parts;

        log[group] = log[group] || {};

        log[group][sub] =
          sig.inputType === "checkbox"
            ? true
            : finalValue;
      }

      console.log("✅ SAVED:", key, finalValue);
    }

    /* ===================================================== */
    /* 🧠 FALLBACK (IMPORTANT FIX)                          */
    /* ===================================================== */

    if (!matchedSomething) {
      console.log("⚠️ No signals matched (but session continues)");

      /* still keep session alive */
      log.meta = log.meta || {};
      log.meta.notes = log.meta.notes || [];
      log.meta.notes.push(message);
    }

    await log.save();

    return {
      success: true,
      signals: Object.fromEntries(log.signals),
      session,
    };
  } catch (err) {
    console.error("EXECUTOR ERROR:", err);
    return { success: false };
  }
}