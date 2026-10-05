import { getActiveDate, parseLocalToUTC } from "../../automation/timeUtils";
import { normalizeTemporalInterval } from "../../temporal/normalization/temporalNormalizer";
import { StructuredTemporalMeaning } from "../contracts/SemanticTurnContracts";

export interface ResolvedTemporal {
  rawExpression: string;
  dateOnly: string; // YYYY-MM-DD
  timeOnly?: string; // HH:MM (24h)
  isoTimestamp: string; // Full ISO UTC string
  timezone: string;
}

/**
 * Deterministically resolves already-structured temporal meaning without NLP or regex matching.
 * Implements Guardrail 3 (Deterministic Normalization Layer).
 */
export function resolveStructuredTemporal(
  meaning: StructuredTemporalMeaning,
  timezone: string = "UTC",
  referenceTimeMs: number = Date.now()
): ResolvedTemporal {
  const refDate = new Date(referenceTimeMs);
  const activeDate = getActiveDate(timezone, 4, refDate);
  
  let targetDate = meaning.dateOnly || activeDate;
  if (meaning.relativeAnchor === "TOMORROW") {
    const d = new Date(`${activeDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    targetDate = d.toISOString().split("T")[0];
  } else if (meaning.relativeAnchor === "YESTERDAY") {
    const d = new Date(`${activeDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    targetDate = d.toISOString().split("T")[0];
  }

  const targetTime = meaning.startTime || "12:00";
  const normResult = normalizeTemporalInterval(
    {
      dateOnly: targetDate,
      startTime: targetTime,
      endTime: meaning.endTime,
      durationMinutes: meaning.durationMinutes,
      timezone,
    },
    targetDate
  );

  const iso = normResult.valid && normResult.interval
    ? normResult.interval.startIsoUtc
    : parseLocalToUTC(targetDate, targetTime, timezone).toISOString();

  return {
    rawExpression: meaning.rawExpression || `${targetDate} ${targetTime}`,
    dateOnly: targetDate,
    timeOnly: meaning.startTime,
    isoTimestamp: iso,
    timezone,
  };
}

const DAY_NAME_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Authoritative Deterministic Temporal Resolver
 * Converts relative or conversational time expressions into exact timestamps using explicit timezone.
 */
export function resolveTemporalExpression(
  expression: string | undefined | null,
  timezone: string = "UTC",
  referenceTimeMs: number = Date.now()
): ResolvedTemporal {
  const raw = (expression || "").trim();
  const lower = raw.toLowerCase();
  const refDate = new Date(referenceTimeMs);

  // Default date is today's active date in timezone relative to reference time
  const today = getActiveDate(timezone, 4, refDate);
  let targetDate = today;
  let targetTime: string | undefined = undefined;


  // 1. Time-of-day extraction
  // Matches "3pm", "3:30pm", "3:30 pm", "15:00", "3 pm", etc.
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (timeMatch && (timeMatch[3] || timeMatch[2])) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    targetTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  } else if (lower.includes("morning")) {
    targetTime = "09:00";
  } else if (lower.includes("afternoon")) {
    targetTime = "14:00";
  } else if (lower.includes("evening")) {
    targetTime = "18:00";
  } else if (lower.includes("tonight")) {
    targetTime = "20:00";
  }

  // 2. Date extraction
  if (lower.includes("tomorrow")) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    targetDate = d.toISOString().split("T")[0];
  } else if (lower.includes("yesterday")) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    targetDate = d.toISOString().split("T")[0];
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    targetDate = raw;
  } else {
    // Check day of week (e.g. "monday", "this friday", "next tuesday")
    for (const [dayName, targetDayNum] of Object.entries(DAY_NAME_MAP)) {
      const dayRegex = new RegExp(`\\b(?:next\\s+|this\\s+)?${dayName}\\b`, "i");
      if (dayRegex.test(lower)) {
        const currentDayNum = refDate.getDay();
        let daysUntil = (targetDayNum - currentDayNum + 7) % 7;
        if (daysUntil === 0) daysUntil = 7; // Next occurrence
        if (lower.includes("next") && daysUntil < 7) {
          daysUntil += 7;
        }
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + daysUntil);
        targetDate = d.toISOString().split("T")[0];
        break;
      }
    }
  }

  // 3. Relative offset extraction ("in 2 hours", "in 30 minutes", "in 2 mins", "in 5 min")
  const offsetMatch = lower.match(
    /\bin\s+(\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|sixty)\s+(minute|min|m|hour|hr|h|day|d)s?\b/
  );
  if (offsetMatch) {
    const wordMap: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60,
    };
    const amount = wordMap[offsetMatch[1]] ?? parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    const offsetMs =
      unit.startsWith("m") ? amount * 60 * 1000 : unit.startsWith("h") ? amount * 3600 * 1000 : amount * 86400 * 1000;
    const futureDate = new Date(refDate.getTime() + offsetMs);
    const iso = futureDate.toISOString();

    let localDate = "";
    let localTime = "";
    try {
      localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(futureDate);
      localTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        hourCycle: "h23",
      }).format(futureDate);
    } catch (_) {
      localDate = iso.split("T")[0];
      localTime = iso.split("T")[1].substring(0, 5);
    }

    return {
      rawExpression: raw,
      dateOnly: localDate,
      timeOnly: localTime,
      isoTimestamp: iso,
      timezone,
    };
  }

  // If no specific time was found, default to 12:00 PM local
  const finalTimeStr = targetTime || "12:00";
  const parsedUtcDate = parseLocalToUTC(targetDate, finalTimeStr, timezone);

  return {
    rawExpression: raw || "today",
    dateOnly: targetDate,
    timeOnly: targetTime,
    isoTimestamp: parsedUtcDate.toISOString(),
    timezone,
  };
}
