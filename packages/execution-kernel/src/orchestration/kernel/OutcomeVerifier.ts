import { AuthoritativeKernelState, VerificationOutcome } from "./IKernelCapabilityService";

/**
 * OutcomeVerifier
 * 
 * Invariant 14: Goal completion is verified against authoritative state wherever possible.
 * Requirement 4: Decouple stability score from hard goal completion invariants.
 */
export type StructuredExecutionConstraint =
  | string
  | {
      kind: "NO_RESCHEDULE_ENTITY";
      entityId?: string;
      entityTitle?: string;
    };

export class OutcomeVerifier {
  static verify(
    constraints: StructuredExecutionConstraint[],
    preSnapshot: AuthoritativeKernelState,
    postSnapshot: AuthoritativeKernelState
  ): VerificationOutcome {
    const failedInvariants: string[] = [];
    const diagnosticObservations: string[] = [];

    // 1. HARD INVARIANT: Graph must remain strictly acyclic
    if (postSnapshot.graphSnapshot.cycleDiagnostics.length > 0) {
      failedInvariants.push(
        `[CYCLE_DETECTED]: Introduced ${postSnapshot.graphSnapshot.cycleDiagnostics.length} dependency cycle(s)`
      );
    }

    // 2. HARD INVARIANT: Zero violations of structured explicit constraints (zero NL regex guessing)
    for (const rawConstraint of constraints) {
      let targetTitle: string | undefined;
      let targetId: string | undefined;
      if (typeof rawConstraint === "object" && rawConstraint?.kind === "NO_RESCHEDULE_ENTITY") {
        targetId = rawConstraint.entityId;
        targetTitle = rawConstraint.entityTitle;
      } else if (typeof rawConstraint === "string" && rawConstraint.startsWith("NO_RESCHEDULE:")) {
        targetTitle = rawConstraint.slice("NO_RESCHEDULE:".length).trim();
      }
      if (targetId || targetTitle) {
        const preNode = preSnapshot.graphSnapshot.readyNodes.find(
          (n) => (targetId && n.id === targetId) || (targetTitle && n.title.toLowerCase() === targetTitle.toLowerCase())
        );
        const postNode = postSnapshot.graphSnapshot.readyNodes.find(
          (n) => (targetId && n.id === targetId) || (targetTitle && n.title.toLowerCase() === targetTitle.toLowerCase())
        );
        if (preNode && postNode && preNode.metadata?.dueDate !== postNode.metadata?.dueDate) {
          failedInvariants.push(`[CONSTRAINT_VIOLATED]: Constraint forbade moving "${preNode.title}", but date was changed`);
        }
      }
    }

    // 3. HARD INVARIANT: Precondition / target entity validity
    if (postSnapshot.graphSnapshot.nodeCount < 0) {
      failedInvariants.push("[INVALID_GRAPH_STATE]: Graph node count is negative");
    }

    // 4. SOFT DIAGNOSTIC METRIC: Stability Score Impact (NON-BLOCKING)
    const preStability = preSnapshot.worldSnapshot.executionGraphSummary.stabilityScore ?? 100;
    const postStability = postSnapshot.worldSnapshot.executionGraphSummary.stabilityScore ?? 100;
    const stabilityImpact = postStability - preStability;

    if (stabilityImpact < 0) {
      diagnosticObservations.push(
        `[STABILITY_IMPACT_RECORDED]: Stability score shifted from ${preStability} to ${postStability} (delta: ${stabilityImpact})`
      );
    } else if (stabilityImpact > 0) {
      diagnosticObservations.push(
        `[STABILITY_IMPROVED]: Stability score increased from ${preStability} to ${postStability} (delta: +${stabilityImpact})`
      );
    }

    const allHardInvariantsPassed = failedInvariants.length === 0;

    return {
      allHardInvariantsPassed,
      failedInvariants,
      diagnosticObservations,
      stabilityScoreImpact: stabilityImpact,
    };
  }
}
