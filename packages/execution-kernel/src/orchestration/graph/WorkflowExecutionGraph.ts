/**
 * WorkflowExecutionGraph.ts
 *
 * Sovereign Workflow Execution Graph managing the 12-state node lifecycle,
 * declarative condition evaluations, join semantics (ALL vs. ANY), cascading skips,
 * attempt history tracking, and durable snapshot serialization.
 */

import {
  GraphNodeState,
  GraphNodeStatus,
  NodeAttemptRecord,
  PlanStepCondition,
  PlanStepDefinition,
  ResourceReservation,
  WorkflowExecutionPlan,
  WorkflowGraphSnapshot,
} from "../contracts/WorkflowExecutionContracts";

export class WorkflowExecutionGraph {
  public executionId: string;
  public nodes: Map<string, GraphNodeState> = new Map();
  public activeReservations: ResourceReservation[] = [];
  public approvalExpiresAt: Date | null = null;
  public replanCount: number = 0;
  public status: string = "IN_PROGRESS";

  constructor(plan: WorkflowExecutionPlan, executionId: string = `exec_${Date.now()}`) {
    this.executionId = executionId;
    this.initializeFromPlan(plan);
  }

  /**
   * Initializes graph nodes and establishes upstream/downstream dependency links.
   */
  private initializeFromPlan(plan: WorkflowExecutionPlan): void {
    this.nodes.clear();

    // 1. Create node states
    for (const step of plan.steps) {
      const state: GraphNodeState = {
        stepId: step.stepId,
        step,
        status: "PENDING",
        attempts: [],
        dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
        downstreamStepIds: [],
        condition: step.condition,
        joinType: step.joinType || "ALL",
      };
      this.nodes.set(step.stepId, state);
    }

    // 2. Build reverse downstream edges
    for (const node of this.nodes.values()) {
      for (const depId of node.dependsOn) {
        const depNode = this.nodes.get(depId);
        if (depNode && !depNode.downstreamStepIds.includes(node.stepId)) {
          depNode.downstreamStepIds.push(node.stepId);
        }
      }
    }

    // 3. Evaluate initial ready nodes (nodes with 0 dependencies)
    for (const node of this.nodes.values()) {
      if (node.dependsOn.length === 0) {
        if (node.condition) {
          const satisfies = WorkflowExecutionGraph.evaluateCondition(node.condition, {});
          if (!satisfies) {
            this.markSkippedInternal(node.stepId, "Initial condition evaluated to false");
            continue;
          }
        }

        if (node.step.requiresConfirmation) {
          node.status = "WAITING_FOR_APPROVAL";
          this.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else {
          node.status = "READY";
        }
      }
    }
  }

  /**
   * Declarative Condition Evaluator
   */
  static evaluateCondition(
    condition: PlanStepCondition,
    context: { scratchpad?: Record<string, any>; completedOutputs?: Map<string, any> }
  ): boolean {
    const rawVal = WorkflowExecutionGraph.resolveFieldValue(condition.field, context);

    switch (condition.operator) {
      case "EQUALS":
        return rawVal === condition.value;
      case "NOT_EQUALS":
        return rawVal !== condition.value;
      case "EXISTS":
        return rawVal !== undefined && rawVal !== null;
      case "NOT_EXISTS":
        return rawVal === undefined || rawVal === null;
      case "CONTAINS":
        if (Array.isArray(rawVal)) {
          return rawVal.includes(condition.value);
        }
        if (typeof rawVal === "string") {
          return rawVal.includes(String(condition.value));
        }
        return false;
      case "NOT_CONTAINS":
        if (Array.isArray(rawVal)) {
          return !rawVal.includes(condition.value);
        }
        if (typeof rawVal === "string") {
          return !rawVal.includes(String(condition.value));
        }
        return true;
      case "GREATER_THAN":
        return Number(rawVal) > Number(condition.value);
      case "LESS_THAN":
        return Number(rawVal) < Number(condition.value);
      default:
        return false;
    }
  }

  private static resolveFieldValue(
    field: string,
    context: { scratchpad?: Record<string, any>; completedOutputs?: Map<string, any> }
  ): any {
    if (!field) return undefined;

    // Handle $ref:stepId.path or stepId.path
    let path = field;
    if (path.startsWith("$ref:")) {
      path = path.slice(5).trim();
    }

    const dotIdx = path.indexOf(".");
    if (dotIdx !== -1) {
      const stepId = path.substring(0, dotIdx);
      const propPath = path.substring(dotIdx + 1);

      let stepData = context.completedOutputs?.get(stepId);
      if (stepData === undefined && context.scratchpad) {
        stepData = context.scratchpad[stepId];
      }
      if (!stepData) return undefined;

      return WorkflowExecutionGraph.getByPath(stepData, propPath);
    }

    // Direct lookup in scratchpad or outputs
    if (context.completedOutputs?.has(path)) {
      return context.completedOutputs.get(path);
    }
    if (context.scratchpad && context.scratchpad[path] !== undefined) {
      return context.scratchpad[path];
    }
    return undefined;
  }

  private static getByPath(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Returns all nodes currently eligible for execution.
   */
  getReadyNodes(): GraphNodeState[] {
    return Array.from(this.nodes.values()).filter((n) => n.status === "READY");
  }

  /**
   * Transitions a node from READY to IN_PROGRESS.
   */
  markInProgress(stepId: string): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);
    if (node.status !== "READY") {
      throw new Error(`[INVALID_LIFECYCLE_TRANSITION]: Cannot mark node "${stepId}" IN_PROGRESS from "${node.status}".`);
    }

    node.status = "IN_PROGRESS";
    const attemptNum = node.attempts.length + 1;
    node.attempts.push({
      attempt: attemptNum,
      startedAt: Date.now(),
      status: "IN_PROGRESS",
    });
  }

  /**
   * Transitions a node from IN_PROGRESS to VERIFICATION_PENDING.
   */
  markVerificationPending(stepId: string, output: any): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);
    if (node.status !== "IN_PROGRESS") {
      throw new Error(
        `[INVALID_LIFECYCLE_TRANSITION]: Cannot mark node "${stepId}" VERIFICATION_PENDING from "${node.status}".`
      );
    }

    node.status = "VERIFICATION_PENDING";
    node.output = output;
    const currentAttempt = node.attempts[node.attempts.length - 1];
    if (currentAttempt) {
      currentAttempt.status = "VERIFICATION_PENDING";
      currentAttempt.output = output;
    }
  }

  /**
   * Transitions a node to COMPLETED (authoritative outcome verified).
   * Unblocks downstream dependent nodes.
   */
  markCompleted(stepId: string, output: any): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);
    if (node.status !== "VERIFICATION_PENDING" && node.status !== "IN_PROGRESS") {
      throw new Error(`[INVALID_LIFECYCLE_TRANSITION]: Cannot mark node "${stepId}" COMPLETED from "${node.status}".`);
    }

    node.status = "COMPLETED";
    node.output = output;
    const currentAttempt = node.attempts[node.attempts.length - 1];
    if (currentAttempt) {
      currentAttempt.status = "COMPLETED";
      currentAttempt.completedAt = Date.now();
      currentAttempt.output = output;
    }

    this.checkDownstreamReady(stepId);
  }

  /**
   * Transitions a node to FAILED.
   * Blocks downstream dependent nodes.
   */
  markFailed(stepId: string, error: string): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);

    node.status = "FAILED";
    node.error = error;
    const currentAttempt = node.attempts[node.attempts.length - 1];
    if (currentAttempt) {
      currentAttempt.status = "FAILED";
      currentAttempt.completedAt = Date.now();
      currentAttempt.error = error;
    }

    // Downstream nodes become BLOCKED unless they use joinType: "ANY" and another branch succeeds
    for (const downId of node.downstreamStepIds) {
      const downNode = this.nodes.get(downId);
      if (downNode && downNode.status === "PENDING") {
        if (downNode.joinType !== "ANY") {
          downNode.status = "BLOCKED";
          downNode.error = `Blocked by upstream failure in step "${stepId}": ${error}`;
        }
      }
    }
  }

  /**
   * Transitions a node to OUTCOME_UNKNOWN (ambiguous failure, timeout, or inconclusive).
   */
  markOutcomeUnknown(stepId: string, error: string): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);

    node.status = "OUTCOME_UNKNOWN";
    node.error = error;
    const currentAttempt = node.attempts[node.attempts.length - 1];
    if (currentAttempt) {
      currentAttempt.status = "OUTCOME_UNKNOWN";
      currentAttempt.completedAt = Date.now();
      currentAttempt.error = error;
    }
  }

  /**
   * Transitions a node to WAITING_FOR_APPROVAL.
   */
  markWaitingForApproval(stepId: string): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);
    node.status = "WAITING_FOR_APPROVAL";
    this.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  /**
   * Approves a node paused in WAITING_FOR_APPROVAL, advancing to READY.
   */
  approveNode(stepId: string): void {
    const node = this.nodes.get(stepId);
    if (!node) throw new Error(`[GRAPH_ERROR]: Node "${stepId}" not found.`);
    if (node.status !== "WAITING_FOR_APPROVAL") {
      throw new Error(`[INVALID_LIFECYCLE_TRANSITION]: Cannot approve node "${stepId}" in status "${node.status}".`);
    }
    node.status = "READY";
    this.approvalExpiresAt = null;
  }

  /**
   * Transitions a node to CANCELLED.
   */
  markCancelled(stepId: string, reason: string = "User or timeout cancelled"): void {
    const node = this.nodes.get(stepId);
    if (!node) return;
    node.status = "CANCELLED";
    node.error = reason;
    const currentAttempt = node.attempts[node.attempts.length - 1];
    if (currentAttempt && !currentAttempt.completedAt) {
      currentAttempt.status = "CANCELLED";
      currentAttempt.completedAt = Date.now();
      currentAttempt.error = reason;
    }
  }

  /**
   * Cascading skip handler.
   */
  private markSkippedInternal(stepId: string, reason: string): void {
    const node = this.nodes.get(stepId);
    if (!node || node.status === "SKIPPED") return;

    node.status = "SKIPPED";
    node.error = reason;

    // Propagate cascading skips to downstream nodes
    for (const downId of node.downstreamStepIds) {
      const downNode = this.nodes.get(downId);
      if (!downNode || downNode.status !== "PENDING") continue;

      // If all upstream dependencies are SKIPPED, or joinType is ALL and this dep was skipped without alternative
      const allDepsSkipped = downNode.dependsOn.every((dep) => this.nodes.get(dep)?.status === "SKIPPED");
      if (allDepsSkipped || downNode.joinType === "ALL") {
        this.markSkippedInternal(downId, `Cascading skip: upstream step "${stepId}" was skipped`);
      }
    }
  }

  /**
   * Checks downstream dependencies and advances them to READY if join conditions are satisfied.
   */
  private checkDownstreamReady(completedStepId: string): void {
    const completedNode = this.nodes.get(completedStepId);
    if (!completedNode) return;

    // Collect all outputs for condition resolution
    const outputs = new Map<string, any>();
    for (const n of this.nodes.values()) {
      if (n.output !== undefined) {
        outputs.set(n.stepId, n.output);
      }
    }

    for (const downId of completedNode.downstreamStepIds) {
      const downNode = this.nodes.get(downId);
      if (!downNode || downNode.status !== "PENDING") continue;

      let isReady = false;

      if (downNode.joinType === "ANY") {
        // ANY: At least one dependency is COMPLETED
        isReady = downNode.dependsOn.some((dep) => this.nodes.get(dep)?.status === "COMPLETED");
      } else {
        // ALL: Every dependency must be COMPLETED or SKIPPED (with at least one COMPLETED)
        const allSatisfied = downNode.dependsOn.every((dep) => {
          const s = this.nodes.get(dep)?.status;
          return s === "COMPLETED" || s === "SKIPPED";
        });
        const hasCompleted = downNode.dependsOn.some((dep) => this.nodes.get(dep)?.status === "COMPLETED");
        isReady = allSatisfied && hasCompleted;
      }

      if (isReady) {
        if (downNode.condition) {
          const satisfies = WorkflowExecutionGraph.evaluateCondition(downNode.condition, {
            completedOutputs: outputs,
          });
          if (!satisfies) {
            this.markSkippedInternal(downId, "Condition evaluated to false after upstream completion");
            continue;
          }
        }

        if (downNode.step.requiresConfirmation) {
          downNode.status = "WAITING_FOR_APPROVAL";
          this.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else {
          downNode.status = "READY";
        }
      }
    }
  }

  /**
   * Evaluates if the entire graph has reached a terminal state.
   */
  isTerminal(): boolean {
    const terminalStatuses: Set<GraphNodeStatus> = new Set(["COMPLETED", "FAILED", "SKIPPED", "CANCELLED", "BLOCKED"]);
    for (const node of this.nodes.values()) {
      if (!terminalStatuses.has(node.status)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Replaces remaining uncompleted nodes with a replanned subgraph.
   * Completed nodes remain immutable.
   */
  replanRemainder(revisedPlan: WorkflowExecutionPlan): void {
    this.replanCount += 1;

    // 1. Identify completed steps
    const completedNodes = Array.from(this.nodes.values()).filter((n) => n.status === "COMPLETED");
    const completedIds = new Set(completedNodes.map((n) => n.stepId));

    // 2. Clear uncompleted nodes
    for (const [id, node] of this.nodes.entries()) {
      if (!completedIds.has(id)) {
        this.nodes.delete(id);
      }
    }

    // 3. Add replacement steps from revised plan
    for (const step of revisedPlan.steps) {
      if (completedIds.has(step.stepId)) continue; // Retain completed state

      const state: GraphNodeState = {
        stepId: step.stepId,
        step,
        status: "PENDING",
        attempts: [],
        dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
        downstreamStepIds: [],
        condition: step.condition,
        joinType: step.joinType || "ALL",
      };
      this.nodes.set(step.stepId, state);
    }

    // 4. Rebuild downstream edges
    for (const node of this.nodes.values()) {
      node.downstreamStepIds = [];
    }
    for (const node of this.nodes.values()) {
      for (const depId of node.dependsOn) {
        const depNode = this.nodes.get(depId);
        if (depNode && !depNode.downstreamStepIds.includes(node.stepId)) {
          depNode.downstreamStepIds.push(node.stepId);
        }
      }
    }

    // 5. Re-check readiness of newly added steps against completed anchor nodes
    for (const completed of completedNodes) {
      this.checkDownstreamReady(completed.stepId);
    }

    // 6. Evaluate initial readiness for newly added steps with 0 dependencies
    for (const node of this.nodes.values()) {
      if (!completedIds.has(node.stepId) && node.dependsOn.length === 0) {
        if (node.step.requiresConfirmation) {
          node.status = "WAITING_FOR_APPROVAL";
          this.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else {
          node.status = "READY";
        }
      }
    }
  }

  /**
   * Serializes graph state into a durable snapshot.
   */
  serializeSnapshot(): WorkflowGraphSnapshot {
    const nodesObj: Record<string, GraphNodeState> = {};
    for (const [id, state] of this.nodes.entries()) {
      nodesObj[id] = { ...state };
    }

    return {
      executionId: this.executionId,
      nodes: nodesObj,
      activeReservations: [...this.activeReservations],
      approvalExpiresAt: this.approvalExpiresAt,
      replanCount: this.replanCount,
      status: this.status,
    };
  }

  /**
   * Restores graph state from a durable snapshot.
   */
  static restoreSnapshot(snapshot: WorkflowGraphSnapshot): WorkflowExecutionGraph {
    const dummyPlan: WorkflowExecutionPlan = {
      goal: "Restored from snapshot",
      userRequest: "Restored from snapshot",
      steps: Object.values(snapshot.nodes).map((n) => n.step),
    };

    const graph = new WorkflowExecutionGraph(dummyPlan, snapshot.executionId);
    graph.nodes.clear();

    for (const [id, state] of Object.entries(snapshot.nodes)) {
      graph.nodes.set(id, { ...state });
    }

    graph.activeReservations = snapshot.activeReservations ? [...snapshot.activeReservations] : [];
    graph.approvalExpiresAt = snapshot.approvalExpiresAt ? new Date(snapshot.approvalExpiresAt) : null;
    graph.replanCount = snapshot.replanCount || 0;
    graph.status = snapshot.status || "IN_PROGRESS";

    return graph;
  }
}
