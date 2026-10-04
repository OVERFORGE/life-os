/**
 * PreferenceAuthorityManager.ts
 * Enforces the 5-Tier Authority Hierarchy:
 * EXPLICIT_HARD (5) > EXPLICIT_SOFT (4) > CANDIDATE (3) > LEARNED (2) > SYSTEM_DEFAULT (1).
 * In-memory cache guarantees < 2ms lookup latency.
 * Part of Phase 4 Deep User Model & Preference Intelligence.
 */

import mongoose from "mongoose";
import {
  IUserPreferenceItem,
  IPreferenceResolution,
  PreferenceAuthority,
  AUTHORITY_PRIORITY,
} from "./PreferenceContracts";
import { UserDeepProfileModel } from "../server/db/models/UserDeepProfileModel";

export class PreferenceAuthorityManager {
  private static instance: PreferenceAuthorityManager;

  // In-memory cache: userId -> Map<key, IUserPreferenceItem>
  private userCache: Map<string, Map<string, IUserPreferenceItem>> = new Map();

  static getInstance(): PreferenceAuthorityManager {
    if (!PreferenceAuthorityManager.instance) {
      PreferenceAuthorityManager.instance = new PreferenceAuthorityManager();
    }
    return PreferenceAuthorityManager.instance;
  }

  /**
   * Resolves the authoritative effective value of a preference key for a user.
   * Execution latency budget: < 2ms via cached map.
   */
  public async resolvePreference(userId: string, key: string): Promise<IPreferenceResolution> {
    const userPrefs = await this.getOrHydrateUserPrefs(userId);
    const item = userPrefs.get(key);

    if (!item) {
      // Default fallback
      return {
        key,
        effectiveValue: false,
        authority: "SYSTEM_DEFAULT",
        isOverridableByAgent: true,
        confidence: 0.5,
        provenance: {
          source: "manual",
          sourceId: "system_defaults",
          subsystem: "PreferenceAuthorityManager",
          extractedAt: Date.now(),
        },
        lastReinforced: 0,
      };
    }

    return {
      key: item.key,
      effectiveValue: item.value,
      authority: item.authority,
      isOverridableByAgent: item.authority !== "EXPLICIT_HARD",
      confidence: item.confidence,
      provenance: item.provenance,
      lastReinforced: item.lastReinforced,
    };
  }

  /**
   * Attempts to set or update a preference.
   * REJECTS if incoming priority < existing priority.
   */
  public async setPreference(userId: string, item: IUserPreferenceItem): Promise<boolean> {
    const userPrefs = await this.getOrHydrateUserPrefs(userId);
    const existing = userPrefs.get(item.key);

    if (existing) {
      const existingPriority = AUTHORITY_PRIORITY[existing.authority];
      const incomingPriority = AUTHORITY_PRIORITY[item.authority];

      if (incomingPriority < existingPriority) {
        // Forbidden: Lower authority cannot silently overwrite higher authority
        return false;
      }
    }

    // Update in-memory cache
    userPrefs.set(item.key, item);

    // Persist to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const updateDoc = {
          $set: {
            "preferences.$[elem]": item,
            updatedAt: new Date(),
          },
        };

        const result = await UserDeepProfileModel.updateOne(
          { userId, "preferences.key": item.key },
          updateDoc,
          { arrayFilters: [{ "elem.key": item.key }] }
        );

        if (result.matchedCount === 0) {
          // Key doesn't exist in document yet, push it
          await UserDeepProfileModel.updateOne(
            { userId },
            {
              $push: { preferences: item },
              $setOnInsert: {
                userId,
                identity: { name: "", timezone: "UTC", role: "" },
                operationalConstraints: [],
                cognitiveBaseline: { avgFocusMinutes: 45, peakHours: [9, 10, 11, 14, 15] },
                version: 1,
              },
            },
            { upsert: true }
          );
        }
      } catch (err) {
        // Log persistence warning without crashing caller
        console.warn(`[PreferenceAuthorityManager] MongoDB update error: ${err}`);
      }
    }

    return true;
  }

  /**
   * Promotes a CANDIDATE preference to EXPLICIT_SOFT upon user confirmation.
   */
  public async promoteCandidatePreference(userId: string, key: string): Promise<boolean> {
    const userPrefs = await this.getOrHydrateUserPrefs(userId);
    const existing = userPrefs.get(key);

    if (!existing || existing.authority !== "CANDIDATE") {
      return false;
    }

    const promotedItem: IUserPreferenceItem = {
      ...existing,
      authority: "EXPLICIT_SOFT",
      confidence: 1.0,
      lastReinforced: Date.now(),
      provenance: {
        source: "manual",
        sourceId: `user_confirmation_${Date.now()}`,
        subsystem: "UserInterface",
        extractedAt: Date.now(),
      },
    };

    return this.setPreference(userId, promotedItem);
  }

  /**
   * Retrieves all effective preferences for a user.
   */
  public async getAllPreferences(userId: string): Promise<IPreferenceResolution[]> {
    const userPrefs = await this.getOrHydrateUserPrefs(userId);
    const results: IPreferenceResolution[] = [];

    for (const [key] of userPrefs) {
      results.push(await this.resolvePreference(userId, key));
    }

    return results;
  }

  /**
   * Clears in-memory cache (for test resets).
   */
  public clearCache(): void {
    this.userCache.clear();
  }

  private async getOrHydrateUserPrefs(userId: string): Promise<Map<string, IUserPreferenceItem>> {
    let prefs = this.userCache.get(userId);
    if (prefs) {
      return prefs;
    }

    prefs = new Map<string, IUserPreferenceItem>();
    this.userCache.set(userId, prefs);

    // Hydrate from DB if ready
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await UserDeepProfileModel.findOne({ userId }).lean().exec();
        if (doc && doc.preferences) {
          for (const item of doc.preferences) {
            prefs.set(item.key, item as IUserPreferenceItem);
          }
        }
      } catch (err) {
        // Fall back to empty map
      }
    }

    return prefs;
  }
}
