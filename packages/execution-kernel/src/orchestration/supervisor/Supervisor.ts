import { DynamicRouter, RoutingDecision } from "./DynamicRouter";
import { ReActOrchestrator } from "../react/ReActOrchestrator";
import { ProductionTraceContext } from "../observability/ProductionTracer";
import { IContextEntityRef } from "../contracts/SemanticTurnContracts";
import { AvenStreamEvent } from "../contracts/AvenStreamContracts";
import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";
import { LifeOSOrchestrationGraph } from "../langgraph/LifeOSOrchestrationGraph";

export interface ProviderConnectionCheckResult {
  connected: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "PERSISTENCE_UNAVAILABLE" | "NOT_REQUIRED";
  providerDisplayName: string;
  error?: string;
}

export interface IProviderConnectionChecker {
  checkConnection(
    userId: string,
    providerId: string
  ): Promise<ProviderConnectionCheckResult>;
}

export interface SupervisorRequest {
  userId: string;
  userName?: string;
  message: string;
  conversationId?: string;
  requestId?: string;
  executionId?: string;
  timezone?: string;
  referenceTimeMs?: number;
  knownTasks?: Array<{ id: string; title: string }>;
  activeFocus?: IContextEntityRef | null;
  onChunk?: (chunk: string) => void;
  onEvent?: (event: AvenStreamEvent) => void;
  abortSignal?: AbortSignal;
  streamMode?: "events" | "raw";
  surfaceContext?: {
    activeExecutionTitle?: string;
    activeExecutionCategory?: string;
    currentInteractionMode?: string;
    sourceSurface?: string;
  };
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
  stmUpdates?: Record<string, any>;
  pendingOperation?: any;
  lifeContext?: ILifeContextProjection;
  semanticTurnMeta?: {
    primaryClassification: string;
    operationsCount: number;
    hasOperations: boolean;
  };
}

/**
 * Supervisor (Aven Orchestration Authority)
 *
 * Delegates all live conversation turns into the single compiled LangGraph
 * production pipeline (`LifeOSOrchestrationGraph`), preserving Stage 0-6
 * contracts while eliminating competing imperative orchestration paths.
 */
export class Supervisor {
  private static instance: Supervisor;
  private connectionChecker?: IProviderConnectionChecker;

  constructor(
    private router: DynamicRouter,
    _legacyFastPath?: any,
    private reactOrchestrator?: ReActOrchestrator,
    private kernel?: any
  ) {}

  getRouter(): DynamicRouter {
    return this.router;
  }

  setConnectionChecker(checker: IProviderConnectionChecker): void {
    this.connectionChecker = checker;
  }

  static getInstance(): Supervisor {
    if (!Supervisor.instance) {
      Supervisor.instance = Supervisor.createDefault();
    }
    return Supervisor.instance;
  }

  static createDefault(customKernel?: any, connectionChecker?: IProviderConnectionChecker): Supervisor {
    const { KernelCapabilityService } = require("../kernel/KernelCapabilityService");
    const kernel = customKernel || KernelCapabilityService.getInstance();
    const router = new DynamicRouter();
    const reactOrchestrator = ReActOrchestrator.createDefault(kernel);
    const supervisor = new Supervisor(router, null, reactOrchestrator, kernel);
    if (connectionChecker) {
      supervisor.setConnectionChecker(connectionChecker);
    }
    return supervisor;
  }

  async execute(req: SupervisorRequest): Promise<SupervisorResponse> {
    return this.processRequest(req);
  }

  async processRequest(req: SupervisorRequest): Promise<SupervisorResponse> {
    return LifeOSOrchestrationGraph.getInstance().runTurn({
      req,
      router: this.router,
      kernel: this.kernel,
      reactOrchestrator: this.reactOrchestrator,
      connectionChecker: this.connectionChecker,
    });
  }
}
