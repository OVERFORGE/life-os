import { DynamicRouter, RoutingDecision } from "./DynamicRouter";
import { FastPathExecutor, FastPathContext } from "./FastPathExecutor";
import { ReActOrchestrator, ReActLoopResult } from "../react/ReActOrchestrator";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { ProductionTracer, ProductionTraceContext } from "../observability/ProductionTracer";
import { generateId } from "../../shared/ids";

export interface SupervisorRequest {
  userId: string;
  message: string;
  conversationId?: string;
  requestId?: string;
  knownTasks?: Array<{ id: string; title: string }>;
}

export interface SupervisorResponse {
  executionId: string;
  requestId?: string;
  routingDecision: RoutingDecision;
  response: string;
  durationMs: number;
  actionsExecuted: number;
  workspaceStatus?: string;
  terminationReason?: string;
  traceContext?: ProductionTraceContext;
}

/**
 * Supervisor (Chief of Staff)
 * 
 * Central cognitive orchestration authority for LifeOS.
 * Owns intake, routing, workspace lifecycle, specialist coordination, and user communication.
 * Invariant 1: Supervisor proposes decisions and asks the kernel to execute; never owns truth directly.
 * Invariant 28: Zero DAG terminology leaked to the end user.
 */
export class Supervisor {
  private static instance: Supervisor;

  constructor(
    private router: DynamicRouter,
    private fastPath: FastPathExecutor,
    private reactOrchestrator: ReActOrchestrator
  ) {}

  static getInstance(): Supervisor {
    if (!Supervisor.instance) {
      Supervisor.instance = Supervisor.createDefault();
    }
    return Supervisor.instance;
  }

  static createDefault(customKernel?: any): Supervisor {
    const { KernelCapabilityService } = require("../kernel/KernelCapabilityService");
    const kernel = customKernel || KernelCapabilityService.getInstance();
    const fastPath = new FastPathExecutor(kernel);
    const router = new DynamicRouter(fastPath);
    const reactOrchestrator = ReActOrchestrator.createDefault(kernel);
    return new Supervisor(router, fastPath, reactOrchestrator);
  }

  async processRequest(req: SupervisorRequest): Promise<SupervisorResponse> {
    const startTime = Date.now();
    const executionId = generateId("exec");
    const requestId = req.requestId || generateId("req");

    // 1. Dynamic Routing Decision
    const routingDecision = this.router.route(req.message);

    // 2. Fast Path Execution Branch (<= 1000ms)
    if (routingDecision.strategy === "FAST_PATH") {
      const fastContext: FastPathContext = {
        executionId,
        knownTasks: req.knownTasks,
      };

      const fastResult = await this.fastPath.execute(req.message, req.userId, fastContext);

      if (fastResult.handled) {
        const durationMs = Date.now() - startTime;
        const actionsExecuted = fastResult.kernelResults?.filter((r) => r.success).length || 0;
        const actionIds = fastResult.kernelResults?.map((r) => r.actionId) || [];

        const traceContext = ProductionTracer.getInstance().recordTrace({
          requestId,
          executionId,
          userId: req.userId,
          actionIds,
          eventIds: [],
          durationMs,
          routingStrategy: "FAST_PATH",
          terminationReason: "GOAL_SATISFIED",
          timestamp: Date.now(),
        });

        return {
          executionId,
          requestId,
          routingDecision,
          response: fastResult.userResponse,
          durationMs,
          actionsExecuted,
          workspaceStatus: "COMPLETED",
          terminationReason: "GOAL_SATISFIED",
          traceContext,
        };
      }
      // If fast path failed to extract or handle, fall through to ReAct orchestrator
    }

    // 3. Multi-Agent / Specialist ReAct Execution Branch
    const workspace = new ExecutionWorkspace({
      executionId,
      userId: req.userId,
      conversationId: req.conversationId,
      userRequest: req.message,
      goal: req.message,
      constraints: [],
    });

    const reactResult: ReActLoopResult = await this.reactOrchestrator.runLoop(
      executionId,
      req.userId,
      req.message,
      workspace
    );

    const durationMs = Date.now() - startTime;
    const actionsExecuted = reactResult.executedActions.filter((a) => a.success).length;
    const actionIds = reactResult.executedActions.map((a) => a.actionId);
    const eventIds = workspace.ledger.getEvents().map((e) => e.id);

    const traceContext = ProductionTracer.getInstance().recordTrace({
      requestId,
      executionId,
      userId: req.userId,
      memorySnapshotId: executionId,
      actionIds,
      eventIds,
      durationMs,
      routingStrategy: routingDecision.strategy,
      terminationReason: reactResult.terminationReason,
      timestamp: Date.now(),
    });

    return {
      executionId,
      requestId,
      routingDecision,
      response: reactResult.userSummary,
      durationMs,
      actionsExecuted,
      workspaceStatus: workspace.getState().status,
      terminationReason: reactResult.terminationReason,
      traceContext,
    };
  }
}
