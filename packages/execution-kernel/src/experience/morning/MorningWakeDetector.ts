/**
 * Morning Wake Detector (Phase 9)
 * 
 * Detects morning wake-up events via wearable telemetry, device interaction,
 * or scheduled morning cron, triggering the pre-generation of the morning briefing.
 */

import { MorningBriefingEngine } from "./MorningBriefingEngine";
import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";
import { IMorningBriefing } from "./contracts/MorningBriefingContracts";

export type WakeTriggerSource = "WEARABLE_SLEEP_END" | "FIRST_APP_OPEN" | "SCHEDULED_CRON";

export interface IWakeDetectionEvent {
  userId: string;
  source: WakeTriggerSource;
  detectedAt: number;
  metadata?: Record<string, any>;
}

export class MorningWakeDetector {
  private static instance: MorningWakeDetector;
  private generatedToday: Set<string> = new Set(); // Set of `${userId}:${date}`

  constructor(
    private briefingEngine: MorningBriefingEngine = MorningBriefingEngine.getInstance()
  ) {}

  static getInstance(): MorningWakeDetector {
    if (!MorningWakeDetector.instance) {
      MorningWakeDetector.instance = new MorningWakeDetector();
    }
    return MorningWakeDetector.instance;
  }

  /**
   * Handles a potential wake event and generates briefing if not already generated today.
   */
  async handleWakeEvent(
    event: IWakeDetectionEvent,
    projection: ILifeContextProjection,
    now: number = Date.now()
  ): Promise<{ triggered: boolean; briefing?: IMorningBriefing; reason?: string }> {
    const timezone = (projection as any).identity?.timezone || "UTC";
    const dateStr = this.getLocalDateString(now, timezone);
    const key = `${event.userId}:${dateStr}`;

    // 1. Idempotency Check: Don't re-trigger if already generated today
    if (this.generatedToday.has(key)) {
      return {
        triggered: false,
        reason: `Briefing already generated for date ${dateStr}`,
      };
    }

    // 2. Validate time of day: Must be between 05:00 and 12:00 local time
    const localHour = this.getLocalHour(now, timezone);
    if (localHour < 5 || localHour >= 12) {
      return {
        triggered: false,
        reason: `Event outside morning window (05:00 - 12:00, current hour: ${localHour})`,
      };
    }

    // 3. Generate Briefing
    const briefing = await this.briefingEngine.generateBriefing(projection, dateStr, now);
    this.generatedToday.add(key);

    return {
      triggered: true,
      briefing,
    };
  }

  private getLocalDateString(now: number, timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(now));
      return parts;
    } catch {
      return new Date(now).toISOString().slice(0, 10);
    }
  }

  private getLocalHour(now: number, timezone: string): number {
    try {
      const hourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(new Date(now));
      return parseInt(hourStr, 10);
    } catch {
      return new Date(now).getUTCHours();
    }
  }

  clearHistory(userId?: string): void {
    if (userId) {
      for (const k of this.generatedToday) {
        if (k.startsWith(`${userId}:`)) {
          this.generatedToday.delete(k);
        }
      }
    } else {
      this.generatedToday.clear();
    }
  }
}
