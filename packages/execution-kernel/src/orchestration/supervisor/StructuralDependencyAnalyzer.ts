import { SemanticOperation } from "../contracts/SemanticTurnContracts";

/**
 * StructuralDependencyAnalyzer
 *
 * Deterministically determines whether operations in a turn have inter-step data dependencies,
 * intermediate output flows, or sequential execution prerequisites.
 * Invariant: Zero string searches on raw JSON; zero category-based heuristics.
 */

/**
 * Recursively inspects a parameter object to find structural $ref tokens.
 * Supports both string format ("$ref:stepId.path") and object format ({"$ref": { stepId, path }}).
 */
export function extractStepReferences(value: any): string[] {
  const referencedStepIds: string[] = [];

  function traverse(val: any) {
    if (val === null || val === undefined) return;

    if (typeof val === "string") {
      if (val.startsWith("$ref:")) {
        const token = val.slice(5).trim();
        const stepId = token.split(".")[0];
        if (stepId) referencedStepIds.push(stepId);
      }
      return;
    }

    if (typeof val === "object") {
      if ("$ref" in val) {
        const refVal = val["$ref"];
        if (typeof refVal === "string") {
          const stepId = refVal.split(".")[0];
          if (stepId) referencedStepIds.push(stepId);
        } else if (typeof refVal === "object" && refVal?.stepId) {
          referencedStepIds.push(refVal.stepId);
        }
        return;
      }

      if (Array.isArray(val)) {
        for (const item of val) traverse(item);
      } else {
        for (const v of Object.values(val)) traverse(v);
      }
    }
  }

  traverse(value);
  return referencedStepIds;
}

/**
 * Deterministically determines whether operations in a turn have inter-step dependencies.
 * An operation is dependent if:
 * 1. It declares an operationId in its dependencies array that exists in this turn.
 * 2. Any parameter structurally references an upstream operationId via $ref.
 * 3. Its targetEntityId is dynamically bound to an upstream operation ($ref:stepId...).
 */
export function hasStructuralDataDependencies(operations: SemanticOperation[]): boolean {
  if (!operations || operations.length <= 1) return false;

  const operationIds = new Set(operations.map((op) => op.operationId));

  for (let i = 0; i < operations.length; i++) {
    const currentOp = operations[i];

    // 1. Check explicit dependency declarations
    const deps = currentOp.dependencies || (currentOp as any).dependencyRefIds;
    if (Array.isArray(deps) && deps.length > 0) {
      for (const depId of deps) {
        if (operationIds.has(depId)) {
          return true; // Explicit causal dependency within this turn
        }
      }
    }

    // 2. Check parameter references to upstream steps
    const payload = currentOp.payload || (currentOp as any).parameters;
    const refs = extractStepReferences(payload);
    for (const refStepId of refs) {
      if (operationIds.has(refStepId)) {
        return true; // Structural parameter data dependency
      }
    }

    // 3. Check target reference dynamic binding
    if (currentOp.targetReference?.resolvedEntityId?.startsWith("$ref:")) {
      return true;
    }
  }

  return false;
}
