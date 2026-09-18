/**
 * ActivitySession — Runtime Execution State (Phase Hardening)
 *
 * Stores pure runtime execution state for an active activity block.
 * Static metadata & cost coefficients are resolved dynamically from ActivityDefinitionRegistry.
 */

import { ActivityDefinitionId, ActivityDefinitionRegistry } from "./activityDefinitionRegistry";

export type ActivityStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

export interface ActivitySession {
  id: string;
  definitionId: ActivityDefinitionId;
  title: string;
  startedAtVirtualMinute: number;
  estimatedDurationMins: number;
  elapsedMinutes: number;
  status: ActivityStatus;
  targetTaskId: string | null;
  currentObjective: string;
}

export interface CreateActivitySessionInput {
  definitionId: ActivityDefinitionId;
  title?: string;
  currentVirtualMinute: number;
  durationMins?: number;
  targetTaskId?: string;
  currentObjective?: string;
}

export function createActivitySession(input: CreateActivitySessionInput): ActivitySession {
  const def = ActivityDefinitionRegistry.getDefinition(input.definitionId);
  const duration = input.durationMins ?? def.defaultDurationMins;

  return {
    id: `ACT_${input.definitionId}_m${input.currentVirtualMinute}_dur${duration}`,
    definitionId: input.definitionId,
    title: input.title ?? def.title,
    startedAtVirtualMinute: input.currentVirtualMinute,
    estimatedDurationMins: duration,
    elapsedMinutes: 0,
    status: "ACTIVE",
    targetTaskId: input.targetTaskId ?? null,
    currentObjective: input.currentObjective ?? `Execute ${def.title}`,
  };
}
