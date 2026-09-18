import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { AssistantContextDTO } from "./dto/AssistantContextDTO";
import { AssistantDTOMapper } from "./mappers/AssistantDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * AssistantService Application Service (Phase C6 Baseline)
 *
 * SOLE CONSTITUTIONAL OWNER of orchestrating AssistantContextDTO delivery to the AI chat layer.
 *
 * CONSTITUTIONAL RULES:
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes AssistantDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - NEVER calls LLMs directly.
 * - NEVER executes engines independently.
 * - NEVER computes scoring, ranking, or recommendations.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class AssistantService {
  private static instance: AssistantService;

  static getInstance(): AssistantService {
    if (!AssistantService.instance) {
      AssistantService.instance = new AssistantService();
    }
    return AssistantService.instance;
  }

  /**
   * Returns a canonical, fully-projected AssistantContextDTO for the given user.
   * The LLM layer consumes this DTO as read-only context — it never accesses
   * KernelSnapshot or engine internals directly.
   */
  async getAssistantContext(
    userId: string
  ): Promise<Readonly<AssistantContextDTO>> {
    // 1. Build DAG Execution Graph Snapshot
    const graph = await ExecutionGraph.buildFromDatabase(userId);
    const graphSnapshot = graph.createSnapshot();

    // 2. Ingest Telemetry Payload & Quality Metadata
    const telemetryPayload =
      await TelemetryIngestionService.getInstance().ingestTelemetry(userId);

    // 3. Compute Canonical Immutable KernelSnapshot via WorldModelV2 Orchestrator
    const kernelSnapshot = WorldModelV2.getInstance().computeKernelSnapshot({
      userId,
      generationTimestamp: telemetryPayload.generationTimestamp,
      quality: telemetryPayload.telemetryQuality,
      observations: telemetryPayload.observations,
      graphSnapshot,
    });

    // 4. Pure Read-Only Projection via AssistantDTOMapper (IKernelProjectionMapper)
    return AssistantDTOMapper.getInstance().project(kernelSnapshot, graphSnapshot);
  }
}
