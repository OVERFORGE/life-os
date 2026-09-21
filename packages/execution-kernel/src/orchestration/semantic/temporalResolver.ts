import { getActiveDate, parseLocalToUTC } from "../../automation/timeUtils";

export interface ResolvedTemporal {
  rawExpression: string;
  dateOnly: string; // YYYY-MM-DD
  timeOnly?: string; // HH:MM (24h)
  isoTimestamp: string; // Full ISO UTC string
  timezone: string;
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

  // Default date is today's active date in timezone
  const today = getActiveDate(timezone);
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

  // 3. Relative offset extraction ("in 2 hours", "in 30 minutes")
  const offsetMatch = lower.match(/in\s+(\d+)\s+(minute|hour|day)s?/);
  if (offsetMatch) {
    const amount = parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    const offsetMs =
      unit === "minute" ? amount * 60 * 1000 : unit === "hour" ? amount * 3600 * 1000 : amount * 86400 * 1000;
    const futureDate = new Date(refDate.getTime() + offsetMs);
    const iso = futureDate.toISOString();
    return {
      rawExpression: raw,
      dateOnly: iso.split("T")[0],
      timeOnly: iso.split("T")[1].substring(0, 5),
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
