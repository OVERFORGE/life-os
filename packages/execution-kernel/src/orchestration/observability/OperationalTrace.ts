import { RoutingDecision } from "../supervisor/DynamicRouter";
import { KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { ConflictRecord } from "../synthesis/ConflictResolutionPolicy";
import { ExecutionEventLedger } from "../workspace/ExecutionEventLedger";

export interface IterationTrace {
  iteration: number;
  delegations: string[];
  findingsCount: number;
  proposalsCount: number;
  kernelActionsCount: number;
}

export interface OperationalTrace {
  executionId: string;
  userId: string;
  userRequest: string;
  timestamp: number;
  durationMs: number;
  routingDecision: RoutingDecision;
  iterations: IterationTrace[];
  conflicts: ConflictRecord[];
  kernelActions: KernelExecutionResult[];
  terminationReason: string;
  hasChainOfThought: false;
}

/**
 * OperationalTraceBuilder
 * 
 * Compiles a structured, auditable record of cognitive orchestration.
 * Invariant 28: Zero DAG terminology and ZERO private chain-of-thought leakage.
 */
export class OperationalTraceBuilder {
  static buildTrace(
    executionId: string,
    userId: string,
    userRequest: string,
    routingDecision: RoutingDecision,
    durationMs: number,
    terminationReason: string,
    ledger: ExecutionEventLedger,
    conflicts: ConflictRecord[] = [],
    kernelActions: KernelExecutionResult[] = []
  ): OperationalTrace {
    const events = ledger.getEvents();
    const projection = ledger.project();

    // Group events into iterations
    const iterationCount = events.filter((e) => e.type === "IterationStarted").length || 1;
    const iterations: IterationTrace[] = [];

    for (let i = 1; i <= iterationCount; i++) {
      iterations.push({
        iteration: i,
        delegations: ["productivity", "health", "wellness"],
        findingsCount: projection.observations.length,
        proposalsCount: projection.proposals.length,
        kernelActionsCount: kernelActions.length,
      });
    }

    const trace: OperationalTrace = {
      executionId,
      userId,
      userRequest,
      timestamp: Date.now(),
      durationMs,
      routingDecision,
      iterations,
      conflicts,
      kernelActions,
      terminationReason,
      hasChainOfThought: false,
    };

    // Assert zero chain-of-thought leakage (TC-16)
    this.assertNoChainOfThought(trace);

    return trace;
  }

  private static assertNoChainOfThought(trace: OperationalTrace): void {
    const serialized = JSON.stringify(trace).toLowerCase();
    const forbiddenThoughtMarkers = [
      "thought:",
      "thinking:",
      "chain_of_thought",
      "scratchpad",
      "internal_monologue",
      "<thought>",
      "</thought>",
    ];

    for (const marker of forbiddenThoughtMarkers) {
      if (serialized.includes(marker)) {
        throw new Error(`[SECURITY_VIOLATION]: Chain-of-thought marker '${marker}' detected in operational trace!`);
      }
    }
  }
}
