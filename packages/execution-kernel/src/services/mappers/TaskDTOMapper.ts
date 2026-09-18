import { ExecutionNode, ExecutionGraphSnapshot } from "../../kernel/ExecutionGraph";
import { TaskDTO, ExecutionGraphDTO } from "../dto/TaskDTO";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

/**
 * TaskDTOMapper Projection Mapper (Phase C3.1 Constitutional Baseline)
 * 
 * SOLE CONSTITUTIONAL PROJECTION LAYER for Task DTOs.
 * Implements IKernelProjectionMapper<TaskDTO[]> for pure, read-only transformations.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY from canonical KernelSnapshot / ExecutionGraphSnapshot properties.
 * - NEVER reconstructs ready/blocked maps, graph topology, or blockageRatio.
 * - NEVER derives isReady, isBlocked, blockReason, or priority heuristics.
 * - NEVER converts dates using new Date().
 * - Deeply freezes returned DTO array.
 */
export class TaskDTOMapper implements IKernelProjectionMapper<TaskDTO[]> {
  private static instance: TaskDTOMapper;

  static getInstance(): TaskDTOMapper {
    if (!TaskDTOMapper.instance) {
      TaskDTOMapper.instance = new TaskDTOMapper();
    }
    return TaskDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(
    snapshot: KernelSnapshot,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<TaskDTO[]> {
    return TaskDTOMapper.fromKernelSnapshot(snapshot, graphSnapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ TaskDTO[]
   */
  static fromKernelSnapshot(
    snapshot: KernelSnapshot,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<TaskDTO[]> {
    if (!graphSnapshot) {
      return Object.freeze([]);
    }

    const taskDTOs: TaskDTO[] = graphSnapshot.readyNodes.concat(
      graphSnapshot.blockedNodes.map((b) => b.node)
    ).map((node) => Object.freeze(TaskDTOMapper.toTaskDTO(node)));

    return Object.freeze(taskDTOs);
  }

  static toTaskDTO(
    node: ExecutionNode,
    isReady?: boolean,
    isBlocked?: boolean,
    blockReason?: string
  ): TaskDTO {
    const rawDueDate = node.metadata?.dueDate;
    const dueDate = typeof rawDueDate === "number" ? rawDueDate : undefined;

    const rawScheduledTime = node.metadata?.scheduledTime;
    const scheduledTime = typeof rawScheduledTime === "number" ? rawScheduledTime : undefined;

    return Object.freeze({
      id: node.id,
      title: node.title,
      status: node.status,
      priority: node.priority,
      entityType: node.entityType,
      dueDate,
      scheduledTime,
      estimatedDurationMinutes: node.metadata?.estimatedDurationMinutes,
      isReady,
      isBlocked,
      blockReason,
    });
  }

  static toGraphDTO(snapshot: ExecutionGraphSnapshot): ExecutionGraphDTO {
    const readyTasks = snapshot.readyNodes.map((node) =>
      TaskDTOMapper.toTaskDTO(node, true, false)
    );

    const blockedTasks = snapshot.blockedNodes.map((b) =>
      TaskDTOMapper.toTaskDTO(b.node, false, true, b.reason)
    );

    const criticalPathTasks = snapshot.criticalPath.map((node) =>
      TaskDTOMapper.toTaskDTO(node)
    );

    const parallelExecutionWaves = snapshot.parallelExecutionGroups.map((group) =>
      group.map((node) => node.id)
    );

    return Object.freeze({
      schemaVersion: 1,
      graphVersion: snapshot.graphVersion,
      nodeCount: snapshot.nodeCount,
      edgeCount: snapshot.edgeCount,
      blockageRatio: 0,
      readyTasks,
      blockedTasks,
      criticalPathTasks,
      parallelExecutionWaves,
      cycleDiagnostics: snapshot.cycleDiagnostics,
    });
  }
}
