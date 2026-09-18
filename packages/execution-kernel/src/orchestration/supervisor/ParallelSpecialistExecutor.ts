import { ISpecialistAgent, AgentDomain, AgentTask, SpecialistOutput } from "../contracts/AgentContracts";

export interface SpecialistInvocation {
  domain: AgentDomain;
  task: AgentTask;
  projection: any;
}

export interface ParallelExecutionResult {
  successfulOutputs: SpecialistOutput[];
  failedDomains: Array<{ domain: AgentDomain; error: string; isTimeout: boolean }>;
  totalDurationMs: number;
}

/**
 * ParallelSpecialistExecutor
 * 
 * Executes domain reasoning tasks across multiple specialists concurrently.
 * Invariant 3: Parallel reasoning is permitted; parallel authoritative mutation is not.
 * Invariant 7: Specialist failures are isolated; one failure never aborts healthy peers.
 */
export class ParallelSpecialistExecutor {
  constructor(
    private specialists: Map<AgentDomain, ISpecialistAgent>,
    private defaultTimeoutMs: number = 4000
  ) {}

  async executeParallel(
    invocations: SpecialistInvocation[],
    timeoutMs?: number
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    const effectiveTimeout = timeoutMs || this.defaultTimeoutMs;

    const promises = invocations.map(async (inv) => {
      const specialist = this.specialists.get(inv.domain);
      if (!specialist) {
        throw new Error(`[UNREGISTERED_SPECIALIST]: No specialist registered for domain '${inv.domain}'`);
      }

      // Execute with bounded timeout
      return this.withTimeout(
        specialist.analyze(inv.task, inv.projection),
        effectiveTimeout,
        inv.domain
      );
    });

    const settled = await Promise.allSettled(promises);

    const successfulOutputs: SpecialistOutput[] = [];
    const failedDomains: Array<{ domain: AgentDomain; error: string; isTimeout: boolean }> = [];

    settled.forEach((result, idx) => {
      const domain = invocations[idx].domain;
      if (result.status === "fulfilled") {
        successfulOutputs.push(result.value);
      } else {
        const errorMsg = result.reason?.message || String(result.reason);
        const isTimeout = errorMsg.includes("[SPECIALIST_TIMEOUT]");
        failedDomains.push({ domain, error: errorMsg, isTimeout });
      }
    });

    return {
      successfulOutputs,
      failedDomains,
      totalDurationMs: Date.now() - startTime,
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, domain: AgentDomain): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[SPECIALIST_TIMEOUT]: ${domain} specialist timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
