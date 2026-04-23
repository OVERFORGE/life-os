/**
 * timeUtils.ts
 * Deterministic rules for handling dates, cutoffs, and parsing within LifeOS.
 */

/**
 * Returns today's active date (YYYY-MM-DD), considering a configurable rollover hour.
 * If rolloverHour=4, any time before 4 AM is still considered "yesterday".
 */
export function getActiveDate(timezone?: string, rolloverHour: number = 4): string {
    const now = new Date();
    
    const formatterOptions: Intl.DateTimeFormatOptions = { 
        timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', hour12: false
    };

    const formatter = new Intl.DateTimeFormat('en-CA', formatterOptions);
    const parts = formatter.formatToParts(now);
    
    let year = "1970", month = "01", day = "01", hour = 0;
    for (const part of parts) {
        if (part.type === 'year') year = part.value;
        if (part.type === 'month') month = part.value;
        if (part.type === 'day') day = part.value;
        if (part.type === 'hour') hour = parseInt(part.value, 10);
    }

    // Apply configurable rollover cutoff (hours before rolloverHour belong to yesterday)
    let activeDateStr = `${year}-${month}-${day}`;
    if (hour < rolloverHour) {
        const offsetDate = new Date(`${activeDateStr}T12:00:00Z`);
        offsetDate.setUTCDate(offsetDate.getUTCDate() - 1);
        activeDateStr = offsetDate.toISOString().split("T")[0];
    }
    
    return activeDateStr;
}

/**
 * Parses user input like "11:30pm", "7:00am", "11pm" to a continuous hour 0-24
 */
export function parseTimeString(timeStr: string): number | null {
    if (!timeStr) return null;
    const clean = timeStr.toLowerCase().replace(/\s/g, "");
    const match = clean.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
    if (!match) return null;

    let hour = parseInt(match[1] || "0", 10);
    const minute = parseInt(match[2] || "0", 10);
    const ampm = match[3];

    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    return hour + (minute / 60);
}

/**
 * Compute total sleep delta handling midnight barrier
 */
export function computeSleepDelta(sleepStr: string, wakeStr: string): number | null {
    const s = parseTimeString(sleepStr);
    const w = parseTimeString(wakeStr);

    if (s === null || w === null) return null;

    if (w >= s) {
        // e.g. sleep 1am -> wake 8am => 7 hours
        return w - s;
    } else {
        // e.g. sleep 11pm (23) -> wake 7am (7) => 24 - 23 + 7 = 8 hours
        return (24 - s) + w;
    }
}

/**
 * Checks if current time is past a certain threshold (e.g. 21.0 = 9PM)
 */
export function isPastHour(timezone: string | undefined, targetHour: number): boolean {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    let hour = 0, minute = 0;
    for (const part of parts) {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'minute') minute = parseInt(part.value, 10);
    }

    // Adjust hour logic: 24 -> 0
    if (hour === 24) hour = 0;
    const currentFraction = hour + (minute / 60);

    return currentFraction >= targetHour;
}
