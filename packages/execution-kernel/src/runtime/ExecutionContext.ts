import { generateId } from "../shared/ids";

export interface ExecutionContextOptions {
  userId: string;
  mode?: string;
  timezone?: string;
}

export class ExecutionContext {
  readonly executionId: string;
  readonly userId: string;
  readonly startTime: number;
  readonly mode: string;
  readonly timezone?: string;

  constructor(options: ExecutionContextOptions) {
    this.executionId = generateId("exec");
    this.userId = options.userId;
    this.startTime = Date.now();
    this.mode = options.mode || "general";
    this.timezone = options.timezone;
  }
}
