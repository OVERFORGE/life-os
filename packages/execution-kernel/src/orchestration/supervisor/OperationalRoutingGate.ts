/**
 * OperationalRoutingGate.ts
 *
 * Evaluates semantic turn proposals against the authoritative CapabilityRegistry
 * and structural data dependencies.
 *
 * Implements the Six-Category Operational Dispatch Taxonomy defined in V2.3.0:
 * A. SINGLE_ATOMIC_OPERATION (Fast-path single mutation)
 * B. INDEPENDENT_OPERATION_BATCH (Multi-operation turn with zero inter-step dependencies)
 * C. COMPOSITE_WORKFLOW_DAG (Multi-operation turn with inter-step data dependencies)
 * D. CLARIFICATION_REQUIRED (True ambiguity, missing entity, or missing required payload)
 * E. HUMAN_AUTHORIZATION_REQUIRED (Authoritative HITL requirement or exclusive lock)
 * F. UNREGISTERED_CAPABILITY (Unregistered capability URN; fails closed)
 */

import { SemanticTurn, SemanticOperation } from "../contracts/SemanticTurnContracts";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import { hasStructuralDataDependencies } from "./StructuralDependencyAnalyzer";

export type RoutingCategory =
  | "SINGLE_ATOMIC_OPERATION"
  | "INDEPENDENT_OPERATION_BATCH"
  | "COMPOSITE_WORKFLOW_DAG"
  | "CLARIFICATION_REQUIRED"
  | "HUMAN_AUTHORIZATION_REQUIRED"
  | "UNREGISTERED_CAPABILITY";

export interface RoutingEvaluationResult {
  category: RoutingCategory;
  eligibleForImmediateExecution: boolean;
  proposals?: ActionProposal[];
  rejectionCode?: string;
  userExplanation?: string;
  clarificationQuestion?: string;
  candidateEntities?: Array<{ entityId: string; displayName: string }>;
}

export function evaluateOperationalRouting(semanticTurn: SemanticTurn): RoutingEvaluationResult {
  // Gate 1: Non-Action Turns (Casual dialogue, queries, observations)
  if (semanticTurn.primaryClassification !== "ACTION_REQUEST") {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: "NON_ACTION_TURN",
      userExplanation: semanticTurn.conversationalSummary,
    };
  }

  // Gate 2: Semantic Ambiguity Check
  if (semanticTurn.ambiguityStatus !== "UNAMBIGUOUS") {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: `AMBIGUITY_${semanticTurn.ambiguityStatus}`,
      userExplanation: semanticTurn.conversationalSummary,
      clarificationQuestion: semanticTurn.clarification?.questionToUser,
    };
  }

  // Gate 3: Empty Operations Array
  if (!semanticTurn.operations || semanticTurn.operations.length === 0) {
    return {
      category: "CLARIFICATION_REQUIRED",
      eligibleForImmediateExecution: false,
      rejectionCode: "ZERO_OPERATIONS",
      userExplanation: "No actionable operations were extracted from your request.",
    };
  }

  const registry = CapabilityRegistry.getInstance();

  // Gate 4: Capability Existence Check (Fail Closed)
  for (const op of semanticTurn.operations) {
    const urn = op.capabilityURN || op.actionType;
    const desc = registry.getCapability(urn);
    if (!desc) {
      return {
        category: "UNREGISTERED_CAPABILITY",
        eligibleForImmediateExecution: false,
        rejectionCode: "UNREGISTERED_CAPABILITY",
        userExplanation: `The capability '${urn}' is not registered in the LifeOS capability catalog.`,
      };
    }
  }

  // Gate 5: Structural Data Dependency Evaluation
  const hasDependencies = hasStructuralDataDependencies(semanticTurn.operations);
  if (hasDependencies) {
    return {
      category: "COMPOSITE_WORKFLOW_DAG",
      eligibleForImmediateExecution: false,
      rejectionCode: "REQUIRES_DYNAMIC_WORKFLOW_PLANNER",
    };
  }

  // Gate 6: Entity Resolution and Human Authorization Verification
  const proposals: ActionProposal[] = [];

  for (const op of semanticTurn.operations) {
    const urn = op.capabilityURN || op.actionType;
    const desc = registry.getCapability(urn)!;

    // Check Human Authorization Requirement (HITL)
    const requiresApproval =
      desc.requiresApproval === true ||
      (desc.requiredResources || []).some((r) => r.accessMode === "EXCLUSIVE_LOCK");

    if (requiresApproval) {
      return {
        category: "HUMAN_AUTHORIZATION_REQUIRED",
        eligibleForImmediateExecution: false,
        rejectionCode: "REQUIRES_HUMAN_APPROVAL",
        userExplanation: `The action '${desc.displayName || urn}' requires your explicit authorization.`,
      };
    }

    const payload = op.payload || (op as any).parameters;

    // Check Entity Grounding for Mutations on Existing Entities
    const isMutationOnExistingEntity =
      desc.operationKind === "UPDATE" ||
      desc.operationKind === "DELETE" ||
      desc.operationKind === "COMPLETE" ||
      op.actionType.startsWith("update_") ||
      op.actionType.startsWith("delete_") ||
      op.actionType.startsWith("complete_");

    if (isMutationOnExistingEntity) {
      const targetId =
        op.targetReference?.resolvedEntityId ||
        (payload as any)?.taskId ||
        (payload as any)?.id ||
        (payload as any)?.targetEntityId;

      if (!targetId || targetId === "RESOLVE_AT_EXECUTION") {
        return {
          category: "CLARIFICATION_REQUIRED",
          eligibleForImmediateExecution: false,
          rejectionCode: "UNRESOLVED_TARGET_ENTITY",
          userExplanation: `I could not resolve which entity you want to ${op.actionType}.`,
          candidateEntities: op.targetReference?.candidateIds?.map((id, idx) => ({
            entityId: id,
            displayName: (op.targetReference?.evidence?.candidateTitles || [])[idx] || id,
          })),
        };
      }
    }

    // Validate Required Payload Fields
    const isCreation = desc.operationKind === "CREATE" || op.actionType.startsWith("create_");
    if (!payload || (isCreation && Object.keys(payload).length === 0)) {
      return {
        category: "CLARIFICATION_REQUIRED",
        eligibleForImmediateExecution: false,
        rejectionCode: "MISSING_REQUIRED_PAYLOAD",
        userExplanation: `Required parameters for '${op.actionType}' are missing.`,
      };
    }

    const reversibility =
      desc.reversibility ||
      (desc.isReversible ? "reversible_with_compensation" : "irreversible_external");

    proposals.push({
      id: `act_${op.operationId}`,
      operationId: op.operationId,
      domain: op.domain,
      actionType: op.actionType,
      targetEntityId: op.targetReference?.resolvedEntityId || (payload as any)?.taskId || undefined,
      payload,
      rationale: op.targetReference?.rawExpression || op.actionType,
      reversibility,
      idempotencyKey: `turn_${semanticTurn.turnId}_${op.operationId}`,
    });
  }

  // Gate 7: Partition Single Operation vs Independent Batch
  if (proposals.length === 1) {
    return {
      category: "SINGLE_ATOMIC_OPERATION",
      eligibleForImmediateExecution: true,
      proposals,
    };
  } else {
    return {
      category: "INDEPENDENT_OPERATION_BATCH",
      eligibleForImmediateExecution: true,
      proposals,
    };
  }
}
