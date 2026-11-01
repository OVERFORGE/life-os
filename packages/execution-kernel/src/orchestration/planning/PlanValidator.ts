/**
 * PlanValidator.ts
 *
 * Deterministic validator enforcing catalog whitelist, JSON Schema compliance,
 * Kahn's acyclicity algorithm, causal forward $ref validity, and plan resource budgets.
 */

import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import { PlanStepDefinition, WorkflowExecutionPlan } from "../contracts/WorkflowExecutionContracts";

export interface PlanValidationResult {
  valid: boolean;
  reason?: string;
  errors?: string[];
  normalizedPlan?: WorkflowExecutionPlan;
  criticalPathDepth?: number;
}

export class PlanValidator {
  private static MAX_STEPS = 15;
  private static MAX_GRAPH_DEPTH = 5;

  /**
   * Deterministically validates a workflow execution plan.
   */
  static validate(
    plan: WorkflowExecutionPlan,
    registry: CapabilityRegistry = CapabilityRegistry.getInstance()
  ): PlanValidationResult {
    const errors: string[] = [];

    if (!plan || !Array.isArray(plan.steps)) {
      return {
        valid: false,
        reason: "[INVALID_PLAN]: Plan must include a steps array.",
        errors: ["Missing or non-array steps"],
      };
    }

    // 1. Budget enforcement: Max steps (15)
    if (plan.steps.length > PlanValidator.MAX_STEPS) {
      return {
        valid: false,
        reason: `[PLAN_SIZE_EXCEEDED]: Plan contains ${plan.steps.length} steps, exceeding maximum budget of ${PlanValidator.MAX_STEPS}.`,
        errors: [`Steps count (${plan.steps.length}) exceeds ${PlanValidator.MAX_STEPS}`],
      };
    }

    if (plan.steps.length === 0) {
      return { valid: true, normalizedPlan: plan, criticalPathDepth: 0 };
    }

    const stepIdSet = new Set<string>();
    const stepMap = new Map<string, PlanStepDefinition>();

    // Duplicate step ID check
    for (const step of plan.steps) {
      if (!step.stepId || typeof step.stepId !== "string") {
        errors.push(`Step missing stepId: ${JSON.stringify(step)}`);
        continue;
      }
      if (stepIdSet.has(step.stepId)) {
        errors.push(`Duplicate stepId: "${step.stepId}"`);
      }
      stepIdSet.add(step.stepId);
      stepMap.set(step.stepId, step);
    }

    if (errors.length > 0) {
      return { valid: false, reason: errors.join("; "), errors };
    }

    const normalizedSteps: PlanStepDefinition[] = [];

    // 2. Capability Catalog & Schema Boundary Check
    for (const step of plan.steps) {
      const urn = step.capabilityURN || step.actionType;
      const isInternalSynthesis = step.actionType === "synthesis" || urn === "synthesis";

      if (!isInternalSynthesis) {
        if (!registry.hasCapability(urn)) {
          return {
            valid: false,
            reason: `[UNKNOWN_CAPABILITY_URN]: Capability "${urn}" in step "${step.stepId}" is not registered in the catalog.`,
            errors: [`Unregistered capability: ${urn}`],
          };
        }

        const descriptor = registry.getCapability(urn);
        if (descriptor?.status === "REVOKED") {
          return {
            valid: false,
            reason: `[CAPABILITY_REVOKED]: Capability "${urn}" in step "${step.stepId}" has been revoked.`,
            errors: [`Revoked capability: ${urn}`],
          };
        }

        // Schema validation on parameters (ignoring $ref tokens which resolve dynamically)
        const paramValidation = PlanValidator.validateStaticParameters(descriptor?.parametersSchema, step.parameters);
        if (!paramValidation.valid) {
          return {
            valid: false,
            reason: `[INVALID_STEP_PARAMETERS]: Step "${step.stepId}" parameters invalid: ${paramValidation.reason}`,
            errors: paramValidation.errors,
          };
        }
      }

      // Consequential / approval check
      const descriptor = registry.getCapability(urn);
      let requiresConfirmation = Boolean(step.requiresConfirmation);
      if (descriptor?.requiresApproval) {
        requiresConfirmation = true;
      }

      normalizedSteps.push({
        ...step,
        capabilityURN: urn,
        dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
        requiresConfirmation,
      });
    }

    // 3. Kahn's Topological Sort & Acyclicity Verification
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>(); // u -> list of v where v depends on u

    for (const step of normalizedSteps) {
      inDegree.set(step.stepId, 0);
      adjacency.set(step.stepId, []);
    }

    for (const step of normalizedSteps) {
      const deps = step.dependsOn || [];
      for (const depId of deps) {
        if (!stepIdSet.has(depId)) {
          return {
            valid: false,
            reason: `[UNDECLARED_DEPENDENCY_REFERENCE]: Step "${step.stepId}" depends on non-existent step "${depId}".`,
            errors: [`Missing dependency step "${depId}"`],
          };
        }
        if (depId === step.stepId) {
          return {
            valid: false,
            reason: `[DEPENDENCY_CYCLE_DETECTED]: Self-referential dependency detected in step "${step.stepId}".`,
            errors: [`Self dependency in step "${step.stepId}"`],
          };
        }
        inDegree.set(step.stepId, (inDegree.get(step.stepId) || 0) + 1);
        adjacency.get(depId)!.push(step.stepId);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const topoOrder: string[] = [];
    const depthMap = new Map<string, number>();
    for (const id of queue) {
      depthMap.set(id, 1);
    }

    while (queue.length > 0) {
      const u = queue.shift()!;
      topoOrder.push(u);
      const currentDepth = depthMap.get(u) || 1;

      for (const v of adjacency.get(u) || []) {
        const nextDepth = Math.max(depthMap.get(v) || 1, currentDepth + 1);
        depthMap.set(v, nextDepth);

        const newDeg = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
        }
      }
    }

    if (topoOrder.length !== normalizedSteps.length) {
      return {
        valid: false,
        reason: `[DEPENDENCY_CYCLE_DETECTED]: Circular dependency detected among steps: ${Array.from(stepIdSet).filter((s) => !topoOrder.includes(s)).join(", ")}`,
        errors: ["Dependency cycle detected"],
      };
    }

    // Critical path depth check (max 5)
    let maxDepth = 0;
    for (const d of depthMap.values()) {
      if (d > maxDepth) maxDepth = d;
    }
    if (maxDepth > PlanValidator.MAX_GRAPH_DEPTH) {
      return {
        valid: false,
        reason: `[PLAN_DEPTH_EXCEEDED]: Graph critical path depth is ${maxDepth}, exceeding maximum limit of ${PlanValidator.MAX_GRAPH_DEPTH}.`,
        errors: [`Critical path depth (${maxDepth}) > ${PlanValidator.MAX_GRAPH_DEPTH}`],
      };
    }

    // 4. Causal Forward $ref Linkages Verification
    const topoIndexMap = new Map<string, number>();
    topoOrder.forEach((id, idx) => topoIndexMap.set(id, idx));

    for (const step of normalizedSteps) {
      const refMatches = PlanValidator.extractReferences(step.parameters);
      const declaredDeps = new Set(step.dependsOn || []);

      for (const ref of refMatches) {
        if (!stepIdSet.has(ref.targetStepId)) {
          return {
            valid: false,
            reason: `[UNDECLARED_DEPENDENCY_REFERENCE]: Step "${step.stepId}" references undeclared step "${ref.targetStepId}" ($ref:${ref.raw}).`,
            errors: [`Undeclared reference to "${ref.targetStepId}"`],
          };
        }

        if (!declaredDeps.has(ref.targetStepId)) {
          return {
            valid: false,
            reason: `[UNDECLARED_DEPENDENCY_REFERENCE]: Step "${step.stepId}" references step "${ref.targetStepId}" but does not declare it in dependsOn.`,
            errors: [`Missing explicit dependsOn declaration for "${ref.targetStepId}"`],
          };
        }

        const targetIdx = topoIndexMap.get(ref.targetStepId)!;
        const currentIdx = topoIndexMap.get(step.stepId)!;
        if (targetIdx >= currentIdx) {
          return {
            valid: false,
            reason: `[CAUSAL_ORDERING_VIOLATION]: Step "${step.stepId}" references downstream or concurrent step "${ref.targetStepId}".`,
            errors: [`Causal forward reference violation`],
          };
        }
      }
    }

    return {
      valid: true,
      normalizedPlan: {
        ...plan,
        steps: normalizedSteps,
      },
      criticalPathDepth: maxDepth,
    };
  }

  /**
   * Validates parameters ignoring dynamic $ref strings.
   */
  private static validateStaticParameters(
    schema: Record<string, any> | undefined,
    params: Record<string, any> | undefined
  ): { valid: boolean; errors?: string[]; reason?: string } {
    if (!schema || schema.type !== "object") return { valid: true };
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];
    const properties: Record<string, any> = schema.properties || {};

    const errors: string[] = [];
    const p = params || {};

    for (const req of required) {
      if (p[req] === undefined || p[req] === null) {
        errors.push(`Missing required parameter: "${req}"`);
      }
    }

    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null) continue;
      // If it's a dynamic $ref string, skip static type checking as it will be resolved dynamically
      if (typeof v === "string" && v.startsWith("$ref:")) continue;

      const propDef = properties[k];
      if (!propDef || !propDef.type) continue;

      if (propDef.type === "string" && typeof v !== "string") {
        errors.push(`Invalid type for "${k}": expected string, got ${typeof v}`);
      } else if (propDef.type === "number" && (typeof v !== "number" || !Number.isFinite(v))) {
        errors.push(`Invalid type for "${k}": expected number, got ${typeof v}`);
      } else if (propDef.type === "boolean" && typeof v !== "boolean") {
        errors.push(`Invalid type for "${k}": expected boolean, got ${typeof v}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, reason: errors.join("; ") };
    }
    return { valid: true };
  }

  /**
   * Recursively extracts all "$ref:stepId.path" references from a parameters object.
   */
  static extractReferences(obj: any): Array<{ targetStepId: string; path: string; raw: string }> {
    const refs: Array<{ targetStepId: string; path: string; raw: string }> = [];
    if (!obj || typeof obj !== "object") return refs;

    const stack: any[] = [obj];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      if (typeof current === "string") {
        if (current.startsWith("$ref:")) {
          const raw = current.slice(5).trim();
          const dotIdx = raw.indexOf(".");
          const targetStepId = dotIdx !== -1 ? raw.substring(0, dotIdx) : raw;
          const path = dotIdx !== -1 ? raw.substring(dotIdx + 1) : "";
          refs.push({ targetStepId, path, raw });
        }
      } else if (Array.isArray(current)) {
        for (const item of current) stack.push(item);
      } else if (typeof current === "object") {
        for (const val of Object.values(current)) stack.push(val);
      }
    }

    return refs;
  }
}

