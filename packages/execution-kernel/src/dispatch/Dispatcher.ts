import { Job } from "../scheduling/Job";
import { JobMapper } from "./JobMapper";
import { NativeExecutor } from "./NativeExecutor";

/**
 * Dispatcher Subsystem
 * 
 * Single Responsibility: Route eligible Jobs to the Native Executor.
 * Uses JobMapper to format Jobs into executor payload structure.
 */
export class Dispatcher {
  private executor: NativeExecutor;

  constructor() {
    this.executor = NativeExecutor.getInstance();
  }

  static getInstance(): Dispatcher {
    return new Dispatcher();
  }

  async dispatch(
    eligibleJobs: Job[],
    userId: string,
    model?: string
  ): Promise<any[]> {
    if (eligibleJobs.length === 0) {
      console.log(`⚠️  [DISPATCHER] No eligible jobs to dispatch.`);
      return [];
    }

    const legacyActions = JobMapper.toLegacyActions(eligibleJobs);
    console.log(`🚀 [DISPATCHER] Routing ${legacyActions.length} job(s) to Native Executor...`);
    return await this.executor.execute(legacyActions, userId, model);
  }
}
