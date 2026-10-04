/**
 * Proactive Contracts & Interface Definitions (Phase 8)
 * 
 * Defines the 6 Autonomy Tiers (L0 - L5), candidate schema,
 * evaluation results, and action logging models for the Proactive Engine.
 */

import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";

export type AutonomyLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export type ProactiveUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ProactiveDomain = "SCHEDULE" | "HEALTH" | "FOCUS" | "TASK" | "SYSTEM";

export interface IProactiveCandidate {
  candidateId: string;
  userId: string;
  autonomyLevel: AutonomyLevel;
  urgency: ProactiveUrgency;
  domain: ProactiveDomain;
  proposal: ActionProposal;
  rationale: string;
  requiredConfidence: number;
  dedupKey: string;
  actionValueScore: number;       // 0.0 - 1.0 (Value of taking the action)
  estimatedInterruptionCost: number; // 0.0 - 1.0 (Initial estimated cost)
  createdAt: number;
}

export interface IInterruptionCostEvaluation {
  cost: number;
  actionValue: number;
  netValue: number;
  shouldInterrupt: boolean;
  quietHoursActive: boolean;
  rationale: string;
}

export interface IAutonomyEvaluation {
  eligible: boolean;
  effectiveAutonomyLevel: AutonomyLevel;
  requiresApproval: boolean;
  denialReason?: string;
  circuitBreakerTripped: boolean;
}

export interface IProactiveActionLog {
  actionId: string;
  userId: string;
  candidateId: string;
  autonomyLevel: AutonomyLevel;
  domain: ProactiveDomain;
  triggerRule: string;
  confidenceScore: number;
  actionValueScore: number;
  interruptionCostScore: number;
  notificationDispatched: boolean;
  userResponse?: "APPROVED" | "REJECTED" | "DISMISSED" | "IGNORED";
  executionCommitted: boolean;
  executionError?: string;
  executedAt: number;
  dedupKey: string;
}

export interface IProactiveDaemonConfig {
  evaluationIntervalMs: number;       // Default: 15 minutes (900,000 ms)
  maxDailyNotifications: number;     // Policy default: 3
  hourlyRateLimit: number;           // Operational ceiling: 1/hr
  domainCooldownMs: number;          // Default: 4 hours (14,400,000 ms)
  quietHoursStart: number;           // Default: 22 (10 PM)
  quietHoursEnd: number;             // Default: 8 (8 AM)
  defaultAutonomyLevel: AutonomyLevel; // Default: L1
}
