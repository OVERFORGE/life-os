import mongoose from "mongoose";
import {
  IncidentRecord,
  CreateIncidentInput,
  IncidentStatus,
  IncidentSeverity,
  EffectiveOperationalConstraints,
} from "./IncidentContracts";
import { generateId } from "../shared/ids";

/**
 * IncidentService
 * 
 * SOLE OWNER of managing incident lifecycles, active disruption states,
 * and operational constraint boundaries.
 */
export class IncidentService {
  private static instance: IncidentService;
  private inMemoryStore: Map<string, IncidentRecord> = new Map();

  static getInstance(): IncidentService {
    if (!IncidentService.instance) {
      IncidentService.instance = new IncidentService();
    }
    return IncidentService.instance;
  }

  clearInMemoryStore(): void {
    this.inMemoryStore.clear();
  }

  private isDbConnected(): boolean {
    return mongoose.connection && mongoose.connection.readyState === 1;
  }

  async createIncident(input: CreateIncidentInput): Promise<IncidentRecord> {
    if (!input.userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to create incident");
    }

    const id = generateId("inc");
    const now = Date.now();

    const record: IncidentRecord = {
      id,
      userId: input.userId,
      title: input.title,
      domain: input.domain,
      severity: input.severity,
      status: "active",
      startedAt: input.startedAt || now,
      expectedDurationHours: input.expectedDurationHours || 72,
      summary: input.summary,
      symptomsOrSignals: input.symptomsOrSignals || [],
      operationalConstraints: input.operationalConstraints || {},
      tags: input.tags || [],
      updatedAt: now,
    };

    this.inMemoryStore.set(id, { ...record });

    if (this.isDbConnected()) {
      try {
        const { Incident } = await import("@/server/db/models/Incident");
        await Incident.create({
          userId: record.userId,
          title: record.title,
          domain: record.domain,
          severity: record.severity,
          status: record.status,
          startedAt: new Date(record.startedAt),
          expectedDurationHours: record.expectedDurationHours,
          summary: record.summary,
          symptomsOrSignals: record.symptomsOrSignals,
          operationalConstraints: record.operationalConstraints,
          tags: record.tags,
        });
      } catch (err) {
        console.warn("[INCIDENT_SERVICE] DB write warning:", err);
      }
    }

    return { ...record };
  }

  async getActiveIncidents(userId: string): Promise<IncidentRecord[]> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to query incidents");
    }

    const results: IncidentRecord[] = [];

    // In-memory
    for (const inc of this.inMemoryStore.values()) {
      if (inc.userId !== userId) continue;
      if (inc.status === "active" || inc.status === "mitigating") {
        results.push({ ...inc });
      }
    }

    // DB if connected
    if (this.isDbConnected()) {
      try {
        const { Incident } = await import("@/server/db/models/Incident");
        const docs = await Incident.find({
          userId,
          status: { $in: ["active", "mitigating"] },
        }).lean();

        for (const doc of docs) {
          const mapped = this.mapDocToRecord(doc);
          if (!results.some((r) => r.id === mapped.id)) {
            results.push(mapped);
          }
        }
      } catch (err) {
        console.warn("[INCIDENT_SERVICE] DB query warning:", err);
      }
    }

    return results;
  }

  /**
   * Deterministically resolves effective operational constraints across all active incidents (Requirements 25 & 26).
   * 
   * Precedence & conflict resolution rules:
   * - Deterministic sorting: severity weight descending (critical:4 > major:3 > moderate:2 > minor:1), startedAt descending, id ascending.
   * - suppressWorkouts: true if ANY active incident mandates it (safety-first invariant).
   * - maxWorkloadHoursPerDay: minimum value across all active incidents that specify it (most conservative bound).
   * - enforcedSleepTargetHours: maximum value across all active incidents that specify it (highest recovery requirement).
   * - suspendedGoalIds: deduplicated union of all suspended goal IDs.
   */
  async getEffectiveOperationalConstraints(userId: string): Promise<EffectiveOperationalConstraints> {
    const active = await this.getActiveIncidents(userId);
    if (active.length === 0) {
      return {
        activeIncidentCount: 0,
        highestSeverity: null,
        activeIncidentIds: [],
        suppressWorkouts: false,
        suspendedGoalIds: [],
      };
    }

    const severityWeight: Record<IncidentSeverity, number> = {
      critical: 4,
      major: 3,
      moderate: 2,
      minor: 1,
    };

    // Sort deterministically
    const sorted = [...active].sort((a, b) => {
      const wDiff = severityWeight[b.severity] - severityWeight[a.severity];
      if (wDiff !== 0) return wDiff;
      if (b.startedAt !== a.startedAt) return b.startedAt - a.startedAt;
      return a.id.localeCompare(b.id);
    });

    let suppressWorkouts = false;
    let maxWorkload: number | undefined = undefined;
    let enforcedSleep: number | undefined = undefined;
    const suspendedGoals = new Set<string>();
    const notes: string[] = [];

    for (const inc of sorted) {
      const oc = inc.operationalConstraints;
      if (!oc) continue;

      if (oc.suppressWorkouts) {
        suppressWorkouts = true;
      }
      if (typeof oc.maxWorkloadHoursPerDay === "number") {
        maxWorkload = maxWorkload !== undefined
          ? Math.min(maxWorkload, oc.maxWorkloadHoursPerDay)
          : oc.maxWorkloadHoursPerDay;
      }
      if (typeof oc.enforcedSleepTargetHours === "number") {
        enforcedSleep = enforcedSleep !== undefined
          ? Math.max(enforcedSleep, oc.enforcedSleepTargetHours)
          : oc.enforcedSleepTargetHours;
      }
      if (Array.isArray(oc.suspendedGoalIds)) {
        for (const gId of oc.suspendedGoalIds) {
          if (gId) suspendedGoals.add(gId);
        }
      }
      if (oc.notes) {
        notes.push(`[${inc.title}]: ${oc.notes}`);
      }
    }

    return {
      activeIncidentCount: sorted.length,
      highestSeverity: sorted[0].severity,
      activeIncidentIds: sorted.map((i) => i.id),
      suppressWorkouts,
      maxWorkloadHoursPerDay: maxWorkload,
      enforcedSleepTargetHours: enforcedSleep,
      suspendedGoalIds: Array.from(suspendedGoals),
      notes: notes.length > 0 ? notes.join(" | ") : undefined,
    };
  }

  async resolveIncident(id: string, userId: string): Promise<boolean> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to resolve incident");
    }

    const inMem = this.inMemoryStore.get(id);
    if (inMem && inMem.userId === userId) {
      inMem.status = "resolved";
      inMem.resolvedAt = Date.now();
      inMem.updatedAt = Date.now();
    }

    if (this.isDbConnected()) {
      try {
        const { Incident } = await import("@/server/db/models/Incident");
        const res = await Incident.updateOne(
          { _id: id, userId },
          { $set: { status: "resolved", resolvedAt: new Date(), updatedAt: new Date() } }
        );
        return res.matchedCount > 0;
      } catch (err) {
        console.warn("[INCIDENT_SERVICE] resolve DB warning:", err);
      }
    }

    return inMem !== undefined && inMem.userId === userId;
  }

  private mapDocToRecord(doc: any): IncidentRecord {
    return {
      id: doc._id?.toString() || doc.id,
      userId: doc.userId?.toString() || doc.userId,
      title: doc.title,
      domain: doc.domain,
      severity: doc.severity,
      status: doc.status as IncidentStatus,
      startedAt: doc.startedAt ? new Date(doc.startedAt).getTime() : Date.now(),
      resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).getTime() : undefined,
      expectedDurationHours: doc.expectedDurationHours || 72,
      summary: doc.summary,
      symptomsOrSignals: doc.symptomsOrSignals || [],
      operationalConstraints: doc.operationalConstraints || {},
      tags: doc.tags || [],
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
    };
  }
}
