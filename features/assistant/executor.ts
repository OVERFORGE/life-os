import { LifeSignal } from "@/features/signals/models/LifeSignal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { DailySession } from "@/features/dailySession/models/DailySession";
import { computeDayInsights } from "@/features/insights/computeDayInsights";
import { Goal } from "@/features/goals/models/Goal";
import { evaluateGoal } from "@/features/goals/engine/evaluateGoal";
import { groqChat } from "@/server/llm/groq";

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
  return `${match[2]}${match[3] || ""}${match[4]?.toUpperCase() || ""}`;
}

function extractWakeTime(message: string) {
  const match = message.match(/(wake|woke).*?(\d{1,2})(:\d{2})?\s?(am|pm)/i);
  if (!match) return null;
  return `${match[2]}${match[3] || ""}${match[4]?.toUpperCase() || ""}`;
}

function extractDuration(message: string) {
  const match = message.match(/(\d+(?:\.\d+)?)\s*(hour|hr|hrs)/i);
  return match ? parseFloat(match[1]) : 1;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function parseTimeStr(timeStr: string) {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return 0;
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2] || "0");
  const modifier = match[3]?.toLowerCase();
  
  if (modifier === "pm" && hours < 12) hours += 12;
  if (modifier === "am" && hours === 12) hours = 0;
  
  return hours + mins / 60;
}

function calculateTimeDifference(sleepTime: string, wakeTime: string) {
  const s = parseTimeStr(sleepTime);
  const w = parseTimeStr(wakeTime);
  let diff = w - s;
  if (diff < 0) diff += 24; // Crossed midnight
  return diff;
}

function calculateMentalScore({ sleepHours, gym, deepWorkHours }: any) {
  let energy = 5, focus = 5, mood = 5, stress = 5, anxiety = 5;
  
  if (sleepHours >= 7 && sleepHours <= 9) {
    energy += 2; focus += 2; mood += 1; stress -= 1;
  } else if (sleepHours < 5 && sleepHours > 0) {
    energy -= 3; focus -= 2; mood -= 2; stress += 2; anxiety += 1;
  }

  if (gym) {
    energy += 1; mood += 2; stress -= 2; anxiety -= 1;
  }

  if (deepWorkHours >= 4) {
    focus += 2; mood += 1; stress += 1; 
  }

  const cap = (val: number) => Math.max(1, Math.min(10, val));
  return { energy: cap(energy), focus: cap(focus), mood: cap(mood), stress: cap(stress), anxiety: cap(anxiety) };
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

  /* ===================================================== */
  /* 🎯 GOAL CREATION LOGIC                                */
  /* ===================================================== */
  if (tool === "create_goal") {
    try {
      const prompt = `Extract goal details returning strict JSON ONLY. 
User input: "${message}"
Return format:
{
  "title": "string (actionable goal title)",
  "type": "performance" | "identity" | "maintenance",
  "cadence": "daily" | "weekly" | "flexible"
}`;
      
      const groqRes = await groqChat({
        messages: [{ role: "user", content: prompt }],
        temperature: 0
      });
      
      const cleanRes = groqRes.replace(/```json/g, "").replace(/```/g, "").trim();
      const goalData = JSON.parse(cleanRes);

      const goal = await Goal.create({
        ...goalData,
        userId,
      });

      await evaluateGoal({ goal, userId });
      
      return { success: true, goal: goalData };
    } catch (e) {
      console.error("CREATE GOAL ERROR:", e);
      return { success: false, error: "Failed to parse or create goal." };
    }
  }

  /* ===================================================== */
  /* 🎯 DAILY LOG ACTIVITY LOGIC                           */
  /* ===================================================== */
  if (tool !== "log_activity") return null;

  try {
    const lower = message.toLowerCase();

    /* 🟢 GET OR CREATE ACTIVE SESSION */
    let session = await DailySession.findOne({
      userId,
      isComplete: false,
    }).sort({ createdAt: -1 });

    const explicitDate = resolveExplicitDate(message);
    const dateUsed = explicitDate || new Date().toISOString().split("T")[0];

    if (!session) {
      session = await DailySession.create({
        userId,
        date: dateUsed,
        isComplete: false,
      });
      console.log("🆕 New session created:", session.date);
    }
    const finalDate = session.date;

    /* 🟢 GET OR CREATE DAILY LOG */
    let log = await DailyLog.findOne({ userId, date: finalDate });
    if (!log) {
      log = await DailyLog.create({
        userId,
        date: finalDate,
        signals: {},
        sleep: {},
        mental: {},
        physical: {},
        work: {}
      });
    }
    if (!log.sleep) log.sleep = {};
    if (!log.physical) log.physical = {};
    if (!log.work) log.work = {};
    if (!log.mental) log.mental = {};
    if (!(log.signals instanceof Map)) log.signals = new Map(Object.entries(log.signals || {}));

    /* 🕒 TIME HANDLING (WAKE & SLEEP) */
    const sleepTime = extractSleepTime(message);
    const wakeTime = extractWakeTime(message);

    if (wakeTime) {
      session.wakeTime = wakeTime;
      log.sleep.wakeTime = wakeTime;
    }

    if (sleepTime) {
      session.sleepTime = sleepTime;
      log.sleep.sleepTime = sleepTime;
      session.isComplete = true;

      // SLEEP CALCULATION (current wakeTime minus yesterday's sleepTime)
      if (log.sleep.wakeTime) {
        const yesterday = new Date(new Date(finalDate).getTime() - 86400000).toISOString().split("T")[0];
        const yesterdayLog = await DailyLog.findOne({ userId, date: yesterday });
        
        if (yesterdayLog?.sleep?.sleepTime) {
          const hours = calculateTimeDifference(yesterdayLog.sleep.sleepTime, log.sleep.wakeTime);
          log.sleep.hours = parseFloat(hours.toFixed(1));
        }
      }

      // MENTAL SCORING (on day close)
      log.mental = calculateMentalScore({
        sleepHours: log.sleep?.hours || 0,
        gym: log.physical?.gym || false,
        deepWorkHours: log.work?.deepWorkHours || 0
      });

      console.log("🛑 Session completed & Scored:", finalDate);
      await session.save();
      await computeDayInsights({ userId, date: finalDate, session });
    }

    await session.save();

    /* 🧠 MATCH SIGNALS ENGINE */
    const signals = await LifeSignal.find({ userId, enabled: true }).lean();
    let matchedSomething = false;

    for (const sig of signals) {
      const key = sig.key;
      const keyLower = key.toLowerCase();
      const labelLower = sig.label.toLowerCase();

      const normalizedMessage = normalize(lower);
      const normalizedKey = normalize(keyLower);
      const normalizedLabel = normalize(labelLower);

      const match = normalizedMessage.includes(normalizedKey) || normalizedMessage.includes(normalizedLabel);
      const noFapMatch = keyLower.includes("nofap") && (lower.includes("didnt fap") || lower.includes("didn't fap") || lower.includes("no fap"));

      if (!match && !noFapMatch) continue;
      matchedSomething = true;

      let value = 1;
      if (sig.inputType !== "checkbox") {
        value = extractDuration(lower);
      }

      const prev = Number(log.signals.get(key) || 0);
      const finalValue = sig.inputType === "checkbox" ? 1 : prev + value;

      log.signals.set(key, finalValue);

      // Structured mapping natively inside DailyLog properties
      const parts = key.split(".");
      if (parts.length === 2) {
        const [group, sub] = parts as [keyof typeof log, string];
        if (typeof log[group] === 'object' && log[group] !== null) {
          (log[group] as any)[sub] = sig.inputType === "checkbox" ? true : finalValue;
        }
      }
    }

    if (!matchedSomething && !sleepTime && !wakeTime) {
      log.meta = log.meta || {};
      log.meta.notes = log.meta.notes || [];
      log.meta.notes.push(message);
    }

    log.markModified('signals');
    log.markModified('sleep');
    log.markModified('mental');
    await log.save();

    return {
      success: true,
      signals: Object.fromEntries(log.signals),
      session,
      sleepCalculated: log.sleep?.hours || null
    };

  } catch (err) {
    console.error("EXECUTOR ERROR:", err);
    return { success: false };
  }
}