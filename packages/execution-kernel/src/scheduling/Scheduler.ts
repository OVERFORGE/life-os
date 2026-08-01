import { Job } from "./Job";

export interface ScheduleEvaluationResult {
  eligible: Job[];
  deferred: Job[];
}

/**
 * Scheduler Subsystem
 * 
 * Single Responsibility: Determine whether a Job is currently ready/eligible to execute.
 * Performs pure in-memory timestamp evaluation returning immutable Job partitions without state mutation.
 */
export class Scheduler {
  static getInstance(): Scheduler {
    return new Scheduler();
  }

  evaluateEligibility(jobs: Job[]): ScheduleEvaluationResult {
    const now = Date.now();
    const eligible: Job[] = [];
    const deferred: Job[] = [];

    for (const job of jobs) {
      if (job.scheduledFor <= now) {
        eligible.push(job);
      } else {
        deferred.push(job);
      }
    }

    return { eligible, deferred };
  }
}
