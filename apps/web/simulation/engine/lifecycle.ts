/**
 * Simulation Lifecycle Finite State Machine — Phase 1.3
 * Legal state transitions and helper guards for runtime lifecycle.
 */

import { RuntimeStatus } from "../types";

export const VALID_TRANSITIONS: Record<RuntimeStatus, RuntimeStatus[]> = {
  CREATED: ["INITIALIZING", "CANCELLED"],
  INITIALIZING: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: ["CREATED"], // Allow reset back to CREATED
  FAILED: ["CREATED"],    // Allow reset back to CREATED
  CANCELLED: ["CREATED"], // Allow reset back to CREATED
};

export function canTransition(current: RuntimeStatus, next: RuntimeStatus): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export function assertTransition(current: RuntimeStatus, next: RuntimeStatus): void {
  if (!canTransition(current, next)) {
    throw new Error(`Invalid lifecycle transition: cannot move from ${current} to ${next}`);
  }
}

export function canAdvance(status: RuntimeStatus): boolean {
  return status === "RUNNING";
}

export function canPause(status: RuntimeStatus): boolean {
  return status === "RUNNING";
}

export function canResume(status: RuntimeStatus): boolean {
  return status === "PAUSED";
}

export function canFinish(status: RuntimeStatus): boolean {
  return status === "RUNNING" || status === "PAUSED";
}

export function canReset(status: RuntimeStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "PAUSED" || status === "RUNNING";
}
