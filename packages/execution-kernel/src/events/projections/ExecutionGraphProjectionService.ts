/**
 * ExecutionGraphProjectionService.ts
 * 
 * Step 4 Loop 6: Execution Graph Projection Read Service & Revision Sandwich Rebuilder
 * 
 * Enforces:
 * - Invariant 6.2: Cache hit path queries ExecutionGraphDerivedModel and UserGraphRevisionModel; exactly ZERO queries to tasks collection.
 * - Invariant 6.3: Valid cache hit latency is bounded to < 5ms.
 * - Invariant 6.4: Snapshot-Consistent DAG Rebuild using the Revision Sandwich Protocol:
 *   1. Reads R_start from UserGraphRevisionModel.
 *   2. Reads active Task and Goal documents.
 *   3. Reads R_end from UserGraphRevisionModel.
 *   4. If R_start !== R_end, aborts and retries.
 *   5. Commits to ExecutionGraphDerivedModel via CAS conditional on appliedGraphRevision: { $lt: R }.
 *   6. Preserves last valid projection on error.
 */

import { ExecutionGraphDerivedModel, IExecutionGraphDerivedDoc } from "../../../../../apps/web/server/db/models/ExecutionGraphDerivedModel";
import { UserGraphRevisionModel, IUserGraphRevisionDoc } from "../../../../../apps/web/server/db/models/UserGraphRevisionModel";
import { Task } from "../../../../../apps/web/server/db/models/Task";
import { Goal } from "../../../../../apps/web/features/goals/models/Goal";

export interface ExecutionGraphProjectionServiceDependencies {
  derivedModel?: any;
  revisionModel?: any;
  taskModel?: any;
  goalModel?: any;
}

export interface GraphProjectionReadResult {
  graph: any;
  source: "CACHE_HIT" | "COLD_REBUILD";
  latencyMs: number;
}

export class ExecutionGraphProjectionService {
  private static instance: ExecutionGraphProjectionService;
  private derivedModel: any;
  private revisionModel: any;
  private taskModel: any;
  private goalModel: any;

  constructor(deps?: ExecutionGraphProjectionServiceDependencies) {
    this.derivedModel = deps?.derivedModel || ExecutionGraphDerivedModel;
    this.revisionModel = deps?.revisionModel || UserGraphRevisionModel;
    this.taskModel = deps?.taskModel || Task;
    this.goalModel = deps?.goalModel || Goal;
  }

  static getInstance(deps?: ExecutionGraphProjectionServiceDependencies): ExecutionGraphProjectionService {
    if (!ExecutionGraphProjectionService.instance) {
      ExecutionGraphProjectionService.instance = new ExecutionGraphProjectionService(deps);
    }
    return ExecutionGraphProjectionService.instance;
  }

  /**
   * Retrieves the current execution graph projection for a user.
   * On cache hit: returns in < 5ms with exactly ZERO queries to tasks.
   * On cache miss/stale: executes Revision Sandwich Rebuild protocol.
   */
  public async getGraph(userId: string): Promise<GraphProjectionReadResult> {
    const startTime = performance.now();

    // 1. Query derived model and revision model in parallel
    const [derived, revisionDoc] = await Promise.all([
      this.derivedModel.findOne({ userId }),
      this.revisionModel.findOne({ userId }),
    ]);

    const targetRevision = revisionDoc?.graphRevision ?? 0;
    const appliedRevision = derived?.appliedGraphRevision ?? derived?.projectionRevision ?? -1;

    // 2. Cache Hit Verification
    if (derived && targetRevision > 0 && appliedRevision === targetRevision) {
      const latencyMs = Number((performance.now() - startTime).toFixed(2));
      return {
        graph: derived,
        source: "CACHE_HIT",
        latencyMs,
      };
    }

    // 3. Cache Miss / Revision Stale: Execute Revision Sandwich Rebuild
    const rebuiltGraph = await this.rebuildGraphWithSandwich(userId, derived);
    const latencyMs = Number((performance.now() - startTime).toFixed(2));

    return {
      graph: rebuiltGraph,
      source: "COLD_REBUILD",
      latencyMs,
    };
  }

  /**
   * Executes the Revision Sandwich Protocol to atomically rebuild the DAG.
   */
  private async rebuildGraphWithSandwich(
    userId: string,
    existingDerived: any,
    maxRetries: number = 3
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Step 1: Read R_start
        const revStartDoc = await this.revisionModel.findOne({ userId });
        const R_start = revStartDoc?.graphRevision ?? 0;

        // Step 2: Read active Task and Goal documents
        const [tasks, goals] = await Promise.all([
          this.taskModel.find({ userId, isArchived: { $ne: true } }),
          this.goalModel.find({ userId, status: { $ne: "ARCHIVED" } }),
        ]);

        // Step 3: Read R_end
        const revEndDoc = await this.revisionModel.findOne({ userId });
        const R_end = revEndDoc?.graphRevision ?? 0;

        // Step 4: Revision Sandwich Check
        if (R_start !== R_end) {
          // Source mutation occurred mid-read! Retry.
          continue;
        }

        const R = R_start;

        // Step 5: Compute DAG Nodes, Dependencies, and Unblocked Tasks
        const taskNodes = tasks.map((t: any) => ({
          id: String(t._id || t.id),
          title: t.title || "Untitled Task",
          status: t.status || "pending",
          dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
          appliedVersion: typeof t.version === "number" ? t.version : 1,
        }));

        // Completed task set for dependency resolution
        const completedIds = new Set<string>();
        for (const t of taskNodes) {
          if (t.status === "completed") {
            completedIds.add(t.id);
          }
        }

        // Determine unblocked task IDs
        const unblockedTaskIds: string[] = [];
        for (const t of taskNodes) {
          if (t.status !== "completed") {
            const allDepsCompleted = t.dependencies.length === 0 ||
              t.dependencies.every((depId: string) => completedIds.has(depId));
            if (allDepsCompleted) {
              unblockedTaskIds.push(t.id);
            }
          }
        }

        // Step 6: Commit to ExecutionGraphDerivedModel via CAS conditional on appliedGraphRevision < R
        const graphId = `graph_${userId}`;
        const filter = {
          userId,
          $or: [
            { appliedGraphRevision: { $lt: R } },
            { appliedGraphRevision: { $exists: false } },
          ],
        };

        const update = {
          $set: {
            graphId,
            userId,
            nodes: taskNodes,
            unblockedTaskIds,
            appliedGraphRevision: R,
            projectionRevision: R,
            sourceTaskCount: taskNodes.length,
            lastAppliedAt: new Date(),
          },
        };

        const updated = await this.derivedModel.findOneAndUpdate(filter, update, {
          new: true,
          upsert: true,
        });

        if (updated) {
          return updated;
        }

        // If CAS matched 0 docs, a concurrent rebuild already committed R or newer
        const currentDerived = await this.derivedModel.findOne({ userId });
        if (currentDerived) return currentDerived;
      } catch (err) {
        // If an error occurs during rebuild, preserve the last valid projection
        if (existingDerived) return existingDerived;
        throw err;
      }
    }

    // Retries exhausted: return existing projection to preserve availability
    if (existingDerived) return existingDerived;

    // Last resort fallback
    return await this.derivedModel.findOne({ userId });
  }
}
