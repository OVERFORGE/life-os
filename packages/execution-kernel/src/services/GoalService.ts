import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { GoalDTO } from "./dto/GoalDTO";
import { GoalDTOMapper } from "./mappers/GoalDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * GoalService Application Service (Phase C2 Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of orchestrating GoalDTO delivery to clients.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes GoalDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - Never invokes GoalPressureEngineV2 directly.
 * - Computes ZERO business logic, scoring, or heuristics.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class GoalService {
  private static instance: GoalService;

  static getInstance(): GoalService {
    if (!GoalService.instance) {
      GoalService.instance = new GoalService();
    }
    return GoalService.instance;
  }

  async getGoals(userId: string): Promise<Readonly<GoalDTO[]>> {
    // 1. Build DAG Execution Graph Snapshot
    const graph = await ExecutionGraph.buildFromDatabase(userId);
    const graphSnapshot = graph.createSnapshot();

    // 2. Ingest Telemetry Payload & Quality Metadata
    const telemetryPayload = await TelemetryIngestionService.getInstance().ingestTelemetry(userId);

    // 3. Compute Canonical Immutable KernelSnapshot via WorldModelV2 Orchestrator
    const kernelSnapshot = WorldModelV2.getInstance().computeKernelSnapshot({
      userId,
      generationTimestamp: telemetryPayload.generationTimestamp,
      quality: telemetryPayload.telemetryQuality,
      observations: telemetryPayload.observations,
      graphSnapshot,
    });

    // 4. Pure Read-Only Projection via GoalDTOMapper (IKernelProjectionMapper)
    return GoalDTOMapper.getInstance().projectAsync(kernelSnapshot);
  }
}
