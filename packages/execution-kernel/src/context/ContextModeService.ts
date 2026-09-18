import mongoose from "mongoose";
import {
  ContextModeRecord,
  ContextModeType,
  SetContextModeInput,
  DEFAULT_MODE_CONFIGS,
} from "./ContextModeContracts";
import { generateId } from "../shared/ids";

export * from "./ContextModeContracts";


/**
 * ContextModeService
 * 
 * SOLE OWNER of managing user life seasons (SprintMode, SanctuaryMode, SabbaticalMode, StandardMode).
 * Enforces strict user tenant boundaries and lifecycle transitions.
 */
export class ContextModeService {
  private static instance: ContextModeService;
  private inMemoryStore: Map<string, ContextModeRecord> = new Map();

  static getInstance(): ContextModeService {
    if (!ContextModeService.instance) {
      ContextModeService.instance = new ContextModeService();
    }
    return ContextModeService.instance;
  }

  clearInMemoryStore(): void {
    this.inMemoryStore.clear();
  }

  private isDbConnected(): boolean {
    return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  }

  /**
   * Builds default standard mode for a user when no custom mode is active.
   */
  private createDefaultStandardMode(userId: string): ContextModeRecord {
    const now = Date.now();
    return {
      id: `mode_std_${userId}`,
      userId,
      mode: "standard",
      title: "Standard Operational Season",
      reason: "Default balanced operational routine",
      startedAt: now,
      expiresAt: null,
      isActive: true,
      config: { ...DEFAULT_MODE_CONFIGS.standard },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves the currently active ContextMode for a user.
   * If an active mode has expired based on its expiresAt timestamp, it is automatically
   * retired and the user reverts to StandardMode.
   */
  async getActiveMode(userId: string): Promise<ContextModeRecord> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to fetch active context mode");
    }

    const now = Date.now();

    // Check in-memory store
    for (const record of this.inMemoryStore.values()) {
      if (record.userId === userId && record.isActive) {
        if (record.expiresAt && record.expiresAt <= now) {
          // Auto-expire
          record.isActive = false;
          record.updatedAt = now;
          break;
        }
        return { ...record };
      }
    }

    // Check MongoDB if connected
    if (this.isDbConnected()) {
      try {
        const { ContextModeModel } = await import("@/server/db/models/ContextModeModel");
        const doc = await ContextModeModel.findOne({ userId, isActive: true }).lean();
        if (doc) {
          const expiresAt = doc.expiresAt ? new Date(doc.expiresAt).getTime() : null;
          if (expiresAt && expiresAt <= now) {
            await ContextModeModel.updateOne({ _id: doc._id }, { $set: { isActive: false, updatedAt: new Date() } });
          } else {
            const mapped: ContextModeRecord = {
              id: doc._id.toString(),
              userId: doc.userId,
              mode: doc.mode,
              title: doc.title,
              reason: doc.reason,
              startedAt: new Date(doc.startedAt).getTime(),
              expiresAt,
              isActive: true,
              config: doc.config || DEFAULT_MODE_CONFIGS[doc.mode as ContextModeType],
              createdAt: new Date(doc.createdAt).getTime(),
              updatedAt: new Date(doc.updatedAt).getTime(),
            };
            this.inMemoryStore.set(mapped.id, mapped);
            return mapped;
          }
        }
      } catch (err) {
        // Fall back gracefully
      }
    }

    // Default to StandardMode
    return this.createDefaultStandardMode(userId);
  }

  /**
   * Sets and activates an intentional Context Mode for a user.
   * Atomically deactivates any existing active mode for that tenant.
   */
  async setMode(input: SetContextModeInput): Promise<ContextModeRecord> {
    if (!input.userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to set context mode");
    }

    const now = Date.now();
    const mode = input.mode;

    // Deactivate current active mode
    for (const record of this.inMemoryStore.values()) {
      if (record.userId === input.userId && record.isActive) {
        record.isActive = false;
        record.updatedAt = now;
      }
    }

    if (this.isDbConnected()) {
      try {
        const { ContextModeModel } = await import("@/server/db/models/ContextModeModel");
        await ContextModeModel.updateMany(
          { userId: input.userId, isActive: true },
          { $set: { isActive: false, updatedAt: new Date() } }
        );
      } catch (err) {
        // Fall back gracefully
      }
    }

    const baseConfig = DEFAULT_MODE_CONFIGS[mode] || DEFAULT_MODE_CONFIGS.standard;
    const mergedConfig = {
      ...baseConfig,
      targetGoalIds: input.targetGoalIds || [],
      pausedGoalIds: input.pausedGoalIds || [],
      minSleepProtectionHours: input.minSleepProtectionHours || baseConfig.minSleepProtectionHours,
      ...(input.customConfig || {}),
    };

    const expiresAt = input.durationDays && input.durationDays > 0
      ? now + input.durationDays * 24 * 3600 * 1000
      : null;

    const id = generateId("mode");
    const title = input.title || `${mode.toUpperCase()} Season`;
    const reason = input.reason || `User activated ${mode} mode`;

    const record: ContextModeRecord = {
      id,
      userId: input.userId,
      mode,
      title,
      reason,
      startedAt: now,
      expiresAt,
      isActive: true,
      config: mergedConfig,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemoryStore.set(id, { ...record });

    if (this.isDbConnected()) {
      try {
        const { ContextModeModel } = await import("@/server/db/models/ContextModeModel");
        await ContextModeModel.create({
          _id: record.id,
          userId: record.userId,
          mode: record.mode,
          title: record.title,
          reason: record.reason,
          startedAt: new Date(record.startedAt),
          expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
          isActive: true,
          config: record.config,
        });
      } catch (err) {
        console.warn("[CONTEXT_MODE_SERVICE] DB write warning:", err);
      }
    }

    console.log(`🧭 [CONTEXT_MODE] User [${input.userId}] entered [${mode.toUpperCase()}] season: "${title}" (Expires: ${expiresAt ? new Date(expiresAt).toISOString() : "Indefinite"})`);
    return { ...record };
  }

  /**
   * Clears any active custom mode and returns the user to standard operational mode.
   */
  async clearMode(userId: string, reason = "Resumed standard routine"): Promise<ContextModeRecord> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to clear context mode");
    }

    return await this.setMode({
      userId,
      mode: "standard",
      title: "Standard Operational Season",
      reason,
    });
  }

  /**
   * Retrieves all historical and active context mode records for an account.
   */
  async getHistory(userId: string): Promise<ContextModeRecord[]> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to get context mode history");
    }

    const records: ContextModeRecord[] = [];
    for (const record of this.inMemoryStore.values()) {
      if (record.userId === userId) {
        records.push({ ...record });
      }
    }

    records.sort((a, b) => b.startedAt - a.startedAt);
    return records;
  }
}
