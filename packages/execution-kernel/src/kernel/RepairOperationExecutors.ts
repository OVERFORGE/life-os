import { ExecutionGraph } from "./ExecutionGraph";
import { RepairOperation, RepairOpType } from "./AdaptiveRepairEngine";
import { EventBus } from "../events/EventBus";
import { createKernelEvent } from "../events/Event";

export interface IRepairOperationExecutor {
  type: RepairOpType | RepairOpType[];
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void;
}

class UnlockExecutor implements IRepairOperationExecutor {
  type: RepairOpType[] = ["UnlockNode", "MarkReady"];
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void {
    const node = graph.getNode(op.targetNodeId);
    if (node) {
      node.status = "pending";
      node.updatedAt = timestamp;
      eventBus.publish(
        createKernelEvent("NodeUnlocked", "ExecutionGraphApplier", {
          nodeId: node.id,
          title: node.title,
        })
      );
    }
  }
}

class BlockExecutor implements IRepairOperationExecutor {
  type: RepairOpType[] = ["BlockNode", "MarkBlocked"];
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void {
    const node = graph.getNode(op.targetNodeId);
    if (node) {
      node.status = "blocked";
      node.updatedAt = timestamp;
      eventBus.publish(
        createKernelEvent("NodeBlocked", "ExecutionGraphApplier", {
          nodeId: node.id,
          title: node.title,
        })
      );
    }
  }
}

class DelayExecutor implements IRepairOperationExecutor {
  type: RepairOpType[] = ["DelayNode", "RepairSchedule"];
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void {
    const node = graph.getNode(op.targetNodeId);
    if (node) {
      node.updatedAt = timestamp;
      eventBus.publish(
        createKernelEvent("NodeDelayed", "ExecutionGraphApplier", {
          nodeId: node.id,
          title: node.title,
        })
      );
    }
  }
}

class AdvanceExecutor implements IRepairOperationExecutor {
  type: RepairOpType = "AdvanceNode";
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void {
    const node = graph.getNode(op.targetNodeId);
    if (node) {
      node.updatedAt = timestamp;
      eventBus.publish(
        createKernelEvent("NodeAdvanced", "ExecutionGraphApplier", {
          nodeId: node.id,
          title: node.title,
        })
      );
    }
  }
}

class PriorityExecutor implements IRepairOperationExecutor {
  type: RepairOpType[] = ["RecalculatePriority", "RecalculatePressure"];
  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date): void {
    const node = graph.getNode(op.targetNodeId);
    if (node && op.newState) {
      const p = parseInt(op.newState, 10);
      if (!isNaN(p)) node.priority = p;
      node.updatedAt = timestamp;
    }
  }
}

class DependencyExecutor implements IRepairOperationExecutor {
  type: RepairOpType[] = ["AddDependency", "RemoveDependency"];
  execute(graph: ExecutionGraph, op: RepairOperation): void {
    if (op.type === "AddDependency" && op.details) {
      graph.addEdge(op.targetNodeId, op.details, "requires");
    } else if (op.type === "RemoveDependency" && op.details) {
      graph.removeEdge(op.targetNodeId, op.details);
    }
  }
}

/**
 * Command Pattern Registry for Repair Operations
 */
export class RepairOperationExecutorRegistry {
  private static instance: RepairOperationExecutorRegistry;
  private executors: Map<RepairOpType, IRepairOperationExecutor> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  static getInstance(): RepairOperationExecutorRegistry {
    if (!RepairOperationExecutorRegistry.instance) {
      RepairOperationExecutorRegistry.instance = new RepairOperationExecutorRegistry();
    }
    return RepairOperationExecutorRegistry.instance;
  }

  register(executor: IRepairOperationExecutor): void {
    const types = Array.isArray(executor.type) ? executor.type : [executor.type];
    for (const t of types) {
      this.executors.set(t, executor);
    }
  }

  execute(graph: ExecutionGraph, op: RepairOperation, timestamp: Date, eventBus: EventBus): void {
    const executor = this.executors.get(op.type);
    if (executor) {
      executor.execute(graph, op, timestamp, eventBus);
    } else {
      // Fallback default state application
      const node = graph.getNode(op.targetNodeId);
      if (node && op.newState) {
        node.status = op.newState;
        node.updatedAt = timestamp;
      }
    }
  }

  private registerDefaults(): void {
    this.register(new UnlockExecutor());
    this.register(new BlockExecutor());
    this.register(new DelayExecutor());
    this.register(new AdvanceExecutor());
    this.register(new PriorityExecutor());
    this.register(new DependencyExecutor());
  }
}
