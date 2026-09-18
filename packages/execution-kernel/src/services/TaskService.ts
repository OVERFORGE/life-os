import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { ExecutionGraphDTO, TaskDTO } from "./dto/TaskDTO";
import { TaskDTOMapper } from "./mappers/TaskDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * TaskService Application Service (Phase C3 Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of orchestrating TaskDTO delivery to clients.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes TaskDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - Computes ZERO business logic, scoring, urgency, or priority algorithms.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class TaskService {
  private static instance: TaskService;

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  async getTaskDTOs(userId: string): Promise<Readonly<TaskDTO[]>> {
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

    // 4. Pure Read-Only Projection via TaskDTOMapper (IKernelProjectionMapper)
    return TaskDTOMapper.getInstance().project(kernelSnapshot, graphSnapshot);
  }

  /**
   * Legacy Compatibility Methods
   */
  async getExecutionGraph(userId: string): Promise<ExecutionGraphDTO> {
    const graph = await ExecutionGraph.buildFromDatabase(userId);
    const snapshot = graph.createSnapshot();
    return TaskDTOMapper.toGraphDTO(snapshot);
  }

  async getTasks(userId: string): Promise<{ ready: TaskDTO[]; blocked: TaskDTO[] }> {
    const graphDTO = await this.getExecutionGraph(userId);
    return {
      ready: graphDTO.readyTasks,
      blocked: graphDTO.blockedTasks,
    };
  }
}
