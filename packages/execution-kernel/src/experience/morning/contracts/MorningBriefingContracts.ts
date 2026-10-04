/**
 * Morning Briefing Contracts (Phase 9)
 * 
 * Canonical schemas for the Morning Aven / Jarvis Executive Briefing.
 * Restrained, calm, intelligent, zero engineering jargon leakage.
 */

import { ActionProposal } from "../../../orchestration/contracts/ActionProposalContracts";

export type DayDensityTier = "LIGHT" | "MODERATE" | "HEAVY" | "OVERLOADED";
export type RecoveryStatus = "RESTED" | "MODERATE" | "DEPLETED" | "UNKNOWN";

export interface IScheduleOverview {
  totalMeetings: number;
  meetingMinutes: number;
  deepWorkHours: number;
  firstCommitmentTime: string;
  densityTier: DayDensityTier;
}

export interface IPriorityFocusTask {
  id: string;
  title: string;
  rationale: string;
  dueTime?: string;
}

export interface IProposedOptimization {
  optimizationId: string;
  description: string;
  action: ActionProposal;
  impactRationale: string;
}

export interface IMorningBriefing {
  briefingId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  greeting: string;
  readinessHeadline: string;
  readinessScore: number; // 0.0 - 1.0
  recoveryStatus: RecoveryStatus;
  scheduleOverview: IScheduleOverview;
  priorityFocusTask?: IPriorityFocusTask;
  proposedOptimization?: IProposedOptimization;
  transcript: string; // Natural spoken voice transcript (max ~120 words)
  wordCount: number;
  audioUrl?: string;
  generatedAt: number;
}

export interface IMorningBriefingRecord {
  briefingId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  audioUrl?: string;
  transcript: string;
  keyInsights: string[];
  proposedScheduleAdjustments: ActionProposal[];
  readinessScore: number;
  userInteracted: boolean;
  optimizationAccepted?: boolean;
  generatedAt: number;
}
