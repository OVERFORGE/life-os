import { executeActions } from "./executionEngine";

/**
 * Native Executor Subsystem
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Encapsulates the execution engine inside the dispatch subsystem.
 */
export class NativeExecutor {
  static getInstance(): NativeExecutor {
    return new NativeExecutor();
  }

  async execute(actions: any[], userId: string, model?: string): Promise<any[]> {
    if (actions.length === 0) return [];
    return await executeActions(actions, userId, model);
  }
}
