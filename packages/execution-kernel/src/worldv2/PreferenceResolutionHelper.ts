/**
 * PreferenceResolutionHelper.ts
 *
 * Resolves user timezone and preferences via 5-tier PreferenceAuthorityManager
 * and User settings with server-side query timeout (maxTimeMS: 75).
 * Part of Phase B1 Canonical Personal World Model (WP1).
 */

import mongoose from "mongoose";
import { PreferenceAuthorityManager } from "../user/PreferenceAuthorityManager";

export interface ResolvedUserContext {
  timezone: string;
  isTimezoneFallback: boolean;
  wakeMinute: number;
  sleepMinute: number;
  focusBlockThresholdMinutes: number;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
  rawPreferences: Record<string, any>;
}

export class PreferenceResolutionHelper {
  public static readonly DEFAULT_TIMEZONE = "UTC";
  public static readonly DEFAULT_WAKE_MINUTE = 480; // 08:00
  public static readonly DEFAULT_SLEEP_MINUTE = 1380; // 23:00
  public static readonly DEFAULT_FOCUS_THRESHOLD = 90; // 90 min
  public static readonly DEFAULT_QUIET_HOURS_START = 22; // 22:00
  public static readonly DEFAULT_QUIET_HOURS_END = 7; // 07:00
  public static readonly DEFAULT_QUERY_TIMEOUT_MS = 75;

  public static parseTimeToMinute(val: any, defaultMinute: number): number {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
      const parts = val.split(":");
      if (parts.length >= 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
      }
    }
    return defaultMinute;
  }

  /**
   * Resolves user timezone from explicit override, MongoDB User settings, or fallback.
   */
  public static async resolveUserTimezone(
    userId: string,
    explicitTimezone?: string,
    timeoutMs: number = PreferenceResolutionHelper.DEFAULT_QUERY_TIMEOUT_MS
  ): Promise<{ timezone: string; isFallback: boolean }> {
    if (explicitTimezone && explicitTimezone.trim().length > 0) {
      return { timezone: explicitTimezone.trim(), isFallback: false };
    }

    if (mongoose.connection.readyState === 1) {
      try {
        let userModel = (mongoose.models as any)?.User;
        if (!userModel) {
          try {
            userModel = (await import("../../../../apps/web/server/db/models/User")).User;
          } catch (_) {
            try {
              userModel = (await import("@/server/db/models/User")).User;
            } catch (_) {}
          }
        }

        if (userModel) {
          let userDoc: any = null;
          if (mongoose.Types.ObjectId.isValid(userId)) {
            userDoc = await userModel
              .findById(userId)
              .select("settings")
              .maxTimeMS(timeoutMs)
              .lean()
              .exec();
          } else {
            userDoc = await userModel
              .findOne({ userId })
              .select("settings")
              .maxTimeMS(timeoutMs)
              .lean()
              .exec();
          }

          if (userDoc?.settings?.timezone) {
            return { timezone: userDoc.settings.timezone, isFallback: false };
          }
        }
      } catch (err: any) {
        console.warn(`[PreferenceResolutionHelper] User timezone fetch failed: ${err?.message || err}`);
      }
    }

    return { timezone: PreferenceResolutionHelper.DEFAULT_TIMEZONE, isFallback: true };
  }

  /**
   * Resolves comprehensive user preferences and timezone.
   */
  public static async resolveUserContext(
    userId: string,
    explicitTimezone?: string,
    timeoutMs: number = PreferenceResolutionHelper.DEFAULT_QUERY_TIMEOUT_MS
  ): Promise<ResolvedUserContext> {
    const tzResult = await PreferenceResolutionHelper.resolveUserTimezone(userId, explicitTimezone, timeoutMs);

    const prefManager = PreferenceAuthorityManager.getInstance();
    let prefResolutions: any[] = [];
    try {
      prefResolutions = await prefManager.getAllPreferences(userId);
    } catch (err: any) {
      console.warn(`[PreferenceResolutionHelper] Preference lookup failed: ${err?.message || err}`);
    }

    const rawPreferences: Record<string, any> = {};
    for (const pr of prefResolutions) {
      if (pr && pr.key) {
        rawPreferences[pr.key] = pr.effectiveValue;
      }
    }

    const wakeMinute = PreferenceResolutionHelper.parseTimeToMinute(
      rawPreferences["wake_minute"] ?? rawPreferences["sleep_schedule.wake"] ?? rawPreferences["wake_time"],
      PreferenceResolutionHelper.DEFAULT_WAKE_MINUTE
    );

    const sleepMinute = PreferenceResolutionHelper.parseTimeToMinute(
      rawPreferences["sleep_minute"] ?? rawPreferences["sleep_schedule.sleep"] ?? rawPreferences["sleep_time"],
      PreferenceResolutionHelper.DEFAULT_SLEEP_MINUTE
    );

    const focusBlockThresholdMinutes = Number(
      rawPreferences["focus_block_threshold_minutes"] ??
      rawPreferences["focus_threshold"] ??
      PreferenceResolutionHelper.DEFAULT_FOCUS_THRESHOLD
    );

    const quietHoursStartHour = Number(
      rawPreferences["quiet_hours_start_hour"] ??
      rawPreferences["quiet_hours_start"] ??
      PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_START
    );

    const quietHoursEndHour = Number(
      rawPreferences["quiet_hours_end_hour"] ??
      rawPreferences["quiet_hours_end"] ??
      PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_END
    );

    return {
      timezone: tzResult.timezone,
      isTimezoneFallback: tzResult.isFallback,
      wakeMinute,
      sleepMinute,
      focusBlockThresholdMinutes: isNaN(focusBlockThresholdMinutes) ? PreferenceResolutionHelper.DEFAULT_FOCUS_THRESHOLD : focusBlockThresholdMinutes,
      quietHoursStartHour: isNaN(quietHoursStartHour) ? PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_START : quietHoursStartHour,
      quietHoursEndHour: isNaN(quietHoursEndHour) ? PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_END : quietHoursEndHour,
      rawPreferences,
    };
  }

  /**
   * Deterministically determines if current timestamp falls within user's quiet hours.
   */
  public static isQuietHours(
    timestamp: number,
    timezone: string,
    startHour: number = PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_START,
    endHour: number = PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_END
  ): boolean {
    let localHour = new Date(timestamp).getUTCHours();
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        hour: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date(timestamp));
      for (const p of parts) {
        if (p.type === "hour") {
          localHour = parseInt(p.value, 10);
          if (localHour === 24) localHour = 0;
        }
      }
    } catch (_) {}

    if (startHour > endHour) {
      // Crosses midnight: e.g. 22:00 to 07:00
      return localHour >= startHour || localHour < endHour;
    } else {
      // Same day span: e.g. 01:00 to 06:00
      return localHour >= startHour && localHour < endHour;
    }
  }
}
