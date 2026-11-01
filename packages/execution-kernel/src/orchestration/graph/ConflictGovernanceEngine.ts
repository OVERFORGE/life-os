/**
 * ConflictGovernanceEngine.ts
 *
 * Evaluates node concurrency safety, detects segment-based resource collisions,
 * enforces bounded batch parallelism (max 3 actions), and implements joint-state
 * reservation release safety with worker fencing protection (Correction B).
 */

import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import {
  GraphNodeState,
  ResourceReservation,
  StaleWorkerFencedError,
} from "../contracts/WorkflowExecutionContracts";
import { WorkflowExecutionGraph } from "./WorkflowExecutionGraph";

export class ResourceConflictEvaluator {
  /**
   * Normalizes a resource path/URI into discrete path segments.
   */
  static normalizeSegments(resourceId: string): string[] {
    return resourceId
      .replace(/\\/g, "/")
      .split("/")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }

  /**
   * Evaluates hierarchical conflict using exact segment matching.
   * "Desktop" vs "Desktop-old" -> false (distinct segments).
   * "Desktop/report.md" vs "Desktop" -> true (parent-child relationship).
   */
  static hasHierarchicalConflict(resourceA: string, resourceB: string): boolean {
    const segsA = ResourceConflictEvaluator.normalizeSegments(resourceA);
    const segsB = ResourceConflictEvaluator.normalizeSegments(resourceB);

    const minLen = Math.min(segsA.length, segsB.length);
    for (let i = 0; i < minLen; i++) {
      if (segsA[i] !== segsB[i]) {
        return false; // Segment mismatch -> completely disjoint resources
      }
    }
    return true; // Exact match or strict parent-child relationship
  }
}

export interface ResourceClaim {
  resourceKey: string;
  lockType: "EXCLUSIVE" | "SHARED";
}

export class ConflictGovernanceEngine {
  public static MAX_CONCURRENT_ACTIONS = 3;

  /**
   * Extracts resource claims for a graph node from its capability descriptor and parameters.
   */
  static extractResourceClaims(
    node: GraphNodeState,
    registry: CapabilityRegistry = CapabilityRegistry.getInstance()
  ): ResourceClaim[] {
    const urn = node.step.capabilityURN || node.step.actionType;
    const descriptor = registry.getCapability(urn);
    const params = node.step.parameters || {};

    const claims: ResourceClaim[] = [];

    // 1. Filesystem paths
    if (params.path && typeof params.path === "string") {
      const isExclusive =
        urn.includes("write_file") ||
        urn.includes("delete") ||
        node.step.actionType === "write_file";
      claims.push({
        resourceKey: `fs:${params.path.trim().toLowerCase()}`,
        lockType: isExclusive ? "EXCLUSIVE" : "SHARED",
      });
    }

    // 2. Multiple paths / resources if declared in array
    if (Array.isArray(params.paths)) {
      const isExclusive = urn.includes("write") || urn.includes("delete");
      for (const p of params.paths) {
        if (typeof p === "string") {
          claims.push({
            resourceKey: `fs:${p.trim().toLowerCase()}`,
            lockType: isExclusive ? "EXCLUSIVE" : "SHARED",
          });
        }
      }
    }

    // 3. Git repo / issue
    if (params.repo && typeof params.repo === "string") {
      const isExclusive = urn.includes("create_issue") || urn.includes("push") || urn.includes("commit");
      claims.push({
        resourceKey: `git:${params.repo.trim().toLowerCase()}`,
        lockType: isExclusive ? "EXCLUSIVE" : "SHARED",
      });
    }

    // 4. Calendar event
    if (params.eventId && typeof params.eventId === "string") {
      claims.push({
        resourceKey: `cal:${params.eventId.trim()}`,
        lockType: urn.includes("read") ? "SHARED" : "EXCLUSIVE",
      });
    }

    // 5. Tasks
    if (params.taskId && typeof params.taskId === "string") {
      claims.push({
        resourceKey: `task:${params.taskId.trim()}`,
        lockType: urn.includes("read") ? "SHARED" : "EXCLUSIVE",
      });
    }

    // 6. Explicit descriptor requiredResources
    if (descriptor?.requiredResources && descriptor.requiredResources.length > 0) {
      for (const res of descriptor.requiredResources) {
        let uri = res.uriTemplate || urn;
        if (uri.includes("{path}") && params.path) {
          uri = uri.replace("{path}", params.path);
        }
        claims.push({
          resourceKey: `${res.type.toLowerCase()}:${uri.toLowerCase()}`,
          lockType: res.accessMode === "EXCLUSIVE_LOCK" ? "EXCLUSIVE" : "SHARED",
        });
      }
    }

    // If still no claims and capability is mutating, default to exclusive lock on capability urn
    if (claims.length === 0 && descriptor && !descriptor.isIdempotent) {
      claims.push({
        resourceKey: `cap:${urn}`,
        lockType: "EXCLUSIVE",
      });
    }

    return claims;
  }

  /**
   * Partitions ready nodes into an executable concurrent batch (capped at 3)
   * and deferred nodes that have resource conflicts or exceed batch limits.
   */
  static selectConcurrentBatch(
    readyNodes: GraphNodeState[],
    tenantId: string,
    activeReservations: ResourceReservation[],
    registry: CapabilityRegistry = CapabilityRegistry.getInstance()
  ): { runnableBatch: GraphNodeState[]; deferredNodes: GraphNodeState[] } {
    const runnableBatch: GraphNodeState[] = [];
    const deferredNodes: GraphNodeState[] = [];

    // Current batch claims
    const currentBatchClaims: ResourceClaim[] = [];

    for (const node of readyNodes) {
      // Concurrency ceiling check (max 3 actions)
      if (runnableBatch.length >= ConflictGovernanceEngine.MAX_CONCURRENT_ACTIONS) {
        deferredNodes.push(node);
        continue;
      }

      const candidateClaims = ConflictGovernanceEngine.extractResourceClaims(node, registry);

      let hasCollision = false;

      for (const candidate of candidateClaims) {
        // 1. Check collision against active/ambiguous reservations
        for (const res of activeReservations) {
          if (res.status === "RELEASED") continue;
          if (res.tenantId !== tenantId) continue;

          const collides = ResourceConflictEvaluator.hasHierarchicalConflict(
            candidate.resourceKey,
            res.resourceKey
          );

          if (collides) {
            // Collision occurs if either requires EXCLUSIVE
            if (candidate.lockType === "EXCLUSIVE" || res.lockType === "EXCLUSIVE") {
              hasCollision = true;
              break;
            }
          }
        }
        if (hasCollision) break;

        // 2. Check collision against already-selected items in the current batch
        for (const batchClaim of currentBatchClaims) {
          const collides = ResourceConflictEvaluator.hasHierarchicalConflict(
            candidate.resourceKey,
            batchClaim.resourceKey
          );

          if (collides) {
            if (candidate.lockType === "EXCLUSIVE" || batchClaim.lockType === "EXCLUSIVE") {
              hasCollision = true;
              break;
            }
          }
        }
        if (hasCollision) break;
      }

      if (hasCollision) {
        deferredNodes.push(node);
      } else {
        runnableBatch.push(node);
        currentBatchClaims.push(...candidateClaims);
      }
    }

    return { runnableBatch, deferredNodes };
  }

  /**
   * Acquires durable reservations for a batch of nodes.
   */
  static acquireReservations(
    batch: GraphNodeState[],
    tenantId: string,
    graph: WorkflowExecutionGraph,
    registry: CapabilityRegistry = CapabilityRegistry.getInstance()
  ): ResourceReservation[] {
    const newReservations: ResourceReservation[] = [];

    for (const node of batch) {
      const claims = ConflictGovernanceEngine.extractResourceClaims(node, registry);
      for (const claim of claims) {
        const res: ResourceReservation = {
          reservationId: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          tenantId,
          resourceKey: claim.resourceKey,
          stepId: node.stepId,
          lockType: claim.lockType,
          status: "ACTIVE",
          acquiredAt: new Date(),
        };
        newReservations.push(res);
        graph.activeReservations.push(res);
      }
    }

    return newReservations;
  }

  /**
   * Joint External-Outcome Reservation Release Safety (Correction B)
   *
   * Releases reservations ONLY upon:
   * 1. VERIFIED completion (confirmed success)
   * 2. Confirmed absence of mutation (DEFINITIVE_REJECTION or probe confirmed no side effects)
   * 3. COMPENSATED_VERIFIED (compensation saga settled)
   *
   * In all ambiguous, inconclusive, integrity-failure, or un-reconciled states:
   * Retains the reservation as AMBIGUOUS_RETAINED.
   *
   * Worker Fencing: Throws StaleWorkerFencedError if worker generation is stale.
   */
  static releaseReservations(input: {
    stepId: string;
    graph: WorkflowExecutionGraph;
    auditStatus?: "SUCCEEDED" | "FAILED_CONFIRMED" | "OUTCOME_UNKNOWN";
    verificationStatus?: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE" | "INTEGRITY_FAILURE" | "COMPENSATED_VERIFIED";
    isConfirmedAbsence?: boolean;
    expectedGeneration?: number;
    actualGeneration?: number;
  }): void {
    const {
      stepId,
      graph,
      auditStatus,
      verificationStatus,
      isConfirmedAbsence,
      expectedGeneration,
      actualGeneration,
    } = input;

    // Worker Fencing Protection
    if (
      expectedGeneration !== undefined &&
      actualGeneration !== undefined &&
      expectedGeneration !== actualGeneration
    ) {
      throw new StaleWorkerFencedError(
        `Worker fenced: generation mismatch (expected ${expectedGeneration}, got ${actualGeneration}). Aborting reservation release.`
      );
    }

    // Joint State Release Evaluation
    const isSafeToRelease =
      // 1. Confirmed success and verified
      (auditStatus === "SUCCEEDED" && verificationStatus === "VERIFIED") ||
      // 2. Confirmed non-mutation
      isConfirmedAbsence === true ||
      // 3. Definitive rejection with zero side effects
      auditStatus === "FAILED_CONFIRMED" ||
      // 4. Compensation settled cleanly
      verificationStatus === "COMPENSATED_VERIFIED";

    for (const res of graph.activeReservations) {
      if (res.stepId === stepId) {
        if (isSafeToRelease) {
          res.status = "RELEASED";
          res.releasedAt = new Date();
        } else {
          // Retain across OUTCOME_UNKNOWN, INCONCLUSIVE, INTEGRITY_FAILURE, NOT_VERIFIED
          res.status = "AMBIGUOUS_RETAINED";
        }
      }
    }

    // Keep activeReservations clean by retaining only ACTIVE or AMBIGUOUS_RETAINED
    graph.activeReservations = graph.activeReservations.filter((r) => r.status !== "RELEASED");
  }
}

