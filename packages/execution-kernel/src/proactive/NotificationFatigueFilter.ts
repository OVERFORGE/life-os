/**
 * Notification Fatigue Filter (Phase 8)
 * 
 * Enforces:
 * 1. Daily notification budget (Policy default: max 3 alerts/day)
 * 2. Hourly rate limit (Operational ceiling: max 1 alert/hr)
 * 3. Quiet hours (22:00 - 08:00)
 * 4. Per-domain cooldown (4 hours default)
 * 5. Deduplication across daemon cycles (24-hour key expiration)
 * 6. Adaptive fatigue learning based on user dismissals/rejections
 */

import {
  ProactiveDomain,
  IProactiveCandidate,
} from "./contracts/ProactiveContracts";

export interface IFatigueFilterResult {
  allowed: boolean;
  suppressionReason?: string;
  dailyCount: number;
  hourlyCount: number;
}

export class NotificationFatigueFilter {
  private static instance: NotificationFatigueFilter;

  // History tracking per user
  private notificationHistory: Map<string, Array<{ timestamp: number; domain: ProactiveDomain; dedupKey: string }>> = new Map();
  // Per-domain cooldown multipliers learned from dismissals
  private domainCooldownModifiers: Map<string, number> = new Map();

  // Configuration constants
  private readonly MAX_DAILY_NOTIFICATIONS = 3;
  private readonly MAX_HOURLY_NOTIFICATIONS = 1;
  private readonly BASE_DOMAIN_COOLDOWN_MS = 4 * 3600 * 1000; // 4 hours
  private readonly DEDUP_EXPIRY_MS = 24 * 3600 * 1000;        // 24 hours

  static getInstance(): NotificationFatigueFilter {
    if (!NotificationFatigueFilter.instance) {
      NotificationFatigueFilter.instance = new NotificationFatigueFilter();
    }
    return NotificationFatigueFilter.instance;
  }

  /**
   * Checks if a candidate notification is allowed to be dispatched.
   */
  shouldAllowNotification(
    candidate: IProactiveCandidate,
    now: number = Date.now(),
    userTimezone: string = "UTC"
  ): IFatigueFilterResult {
    const userId = candidate.userId;
    const history = this.getUserHistory(userId, now);

    // 1. Deduplication check (within 24 hours)
    const duplicate = history.some(h => h.dedupKey === candidate.dedupKey);
    if (duplicate) {
      return {
        allowed: false,
        suppressionReason: `Duplicate recommendation suppressed: dedupKey ${candidate.dedupKey}`,
        dailyCount: history.length,
        hourlyCount: this.getHourlyCount(history, now),
      };
    }

    // 2. Quiet hours check
    const isQuiet = this.isInQuietHours(now, userTimezone);
    if (isQuiet && candidate.urgency !== "CRITICAL") {
      return {
        allowed: false,
        suppressionReason: "Suppressed during quiet hours (22:00 - 08:00)",
        dailyCount: history.length,
        hourlyCount: this.getHourlyCount(history, now),
      };
    }

    // 3. Daily notification budget (Policy default: max 3/day)
    const dayStart = now - 24 * 3600 * 1000;
    const dailyNotifications = history.filter(h => h.timestamp >= dayStart);
    if (dailyNotifications.length >= this.MAX_DAILY_NOTIFICATIONS && candidate.urgency !== "CRITICAL") {
      return {
        allowed: false,
        suppressionReason: `Daily notification budget exceeded (${dailyNotifications.length}/${this.MAX_DAILY_NOTIFICATIONS})`,
        dailyCount: dailyNotifications.length,
        hourlyCount: this.getHourlyCount(history, now),
      };
    }

    // 4. Hourly rate limit (Operational ceiling: max 1/hr)
    const hourlyCount = this.getHourlyCount(history, now);
    if (hourlyCount >= this.MAX_HOURLY_NOTIFICATIONS && candidate.urgency !== "CRITICAL") {
      return {
        allowed: false,
        suppressionReason: `Hourly rate limit exceeded (${hourlyCount}/${this.MAX_HOURLY_NOTIFICATIONS})`,
        dailyCount: dailyNotifications.length,
        hourlyCount,
      };
    }

    // 5. Per-domain cooldown (Default: 4 hours + learned multiplier)
    const modifier = this.domainCooldownModifiers.get(`${userId}:${candidate.domain}`) ?? 1.0;
    const effectiveCooldown = this.BASE_DOMAIN_COOLDOWN_MS * modifier;
    const lastDomainNotification = [...history]
      .reverse()
      .find(h => h.domain === candidate.domain);

    if (lastDomainNotification && now - lastDomainNotification.timestamp < effectiveCooldown && candidate.urgency !== "CRITICAL") {
      const remainingMinutes = Math.ceil((effectiveCooldown - (now - lastDomainNotification.timestamp)) / 60000);
      return {
        allowed: false,
        suppressionReason: `Domain '${candidate.domain}' is in cooldown (${remainingMinutes}m remaining)`,
        dailyCount: dailyNotifications.length,
        hourlyCount,
      };
    }

    return {
      allowed: true,
      dailyCount: dailyNotifications.length,
      hourlyCount,
    };
  }

  /**
   * Records that a notification was dispatched to the user.
   */
  recordDispatchedNotification(
    userId: string,
    domain: ProactiveDomain,
    dedupKey: string,
    timestamp: number = Date.now()
  ): void {
    let history = this.notificationHistory.get(userId);
    if (!history) {
      history = [];
      this.notificationHistory.set(userId, history);
    }
    history.push({ timestamp, domain, dedupKey });
  }

  /**
   * Adapts cooldown modifiers based on user interaction feedback.
   */
  recordUserFeedback(
    userId: string,
    domain: ProactiveDomain,
    feedback: "APPROVED" | "REJECTED" | "DISMISSED"
  ): void {
    const key = `${userId}:${domain}`;
    const current = this.domainCooldownModifiers.get(key) ?? 1.0;

    if (feedback === "DISMISSED" || feedback === "REJECTED") {
      // Increase domain cooldown penalty by 50%
      this.domainCooldownModifiers.set(key, Math.min(3.0, current + 0.5));
    } else if (feedback === "APPROVED") {
      // Restore towards baseline
      this.domainCooldownModifiers.set(key, Math.max(1.0, current - 0.25));
    }
  }

  /**
   * Checks whether the given timestamp is within quiet hours (22:00 - 08:00) in the user's timezone.
   */
  isInQuietHours(now: number, timezone: string): boolean {
    try {
      const date = new Date(now);
      const hourStr = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(date);
      const hour = parseInt(hourStr, 10);
      return hour >= 22 || hour < 8;
    } catch {
      // Fallback to UTC hours
      const hour = new Date(now).getUTCHours();
      return hour >= 22 || hour < 8;
    }
  }

  getRecentNotificationCount(userId: string, now: number = Date.now()): number {
    const history = this.getUserHistory(userId, now);
    const dayStart = now - 24 * 3600 * 1000;
    return history.filter(h => h.timestamp >= dayStart).length;
  }

  clearHistory(userId: string): void {
    this.notificationHistory.delete(userId);
    this.domainCooldownModifiers.delete(userId);
  }

  private getUserHistory(userId: string, now: number) {
    let history = this.notificationHistory.get(userId) || [];
    // Prune history older than 24 hours
    const cutoff = now - this.DEDUP_EXPIRY_MS;
    history = history.filter(h => h.timestamp >= cutoff);
    this.notificationHistory.set(userId, history);
    return history;
  }

  private getHourlyCount(history: Array<{ timestamp: number }>, now: number): number {
    const hourStart = now - 3600 * 1000;
    return history.filter(h => h.timestamp >= hourStart).length;
  }
}
