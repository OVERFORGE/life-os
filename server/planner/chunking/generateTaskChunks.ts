import { SchedulableTask } from "../types/SchedulingTypes";
import { ChunkedTaskPlan, TaskChunk, ChunkDependency } from "../types/ChunkGraphTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Adaptive Chunking Engine
//
// Deterministically splits a large SchedulableTask into a sequence of TaskChunks,
// respecting cognitive load, deep work requirements, and chunk limits.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard limit to prevent combinatorial explosion during replanning */
const MAX_CHUNKS_PER_TASK = 8;

/** Strict minimum for any task flagged with requiresDeepWork */
const MINIMUM_DEEP_WORK_CHUNK_SIZE = 60;

/** Absolute minimum chunk size to prevent absurd micro-fragmentation */
const FALLBACK_MINIMUM_CHUNK_SIZE = 15;

/**
 * Transforms a single indivisible task into a multi-chunk execution plan.
 * Retains strict topological determinism.
 */
export function generateTaskChunks(task: SchedulableTask): ChunkedTaskPlan {
  // 1. Determine if task is eligible for splitting
  if (!task.splittable || task.estimatedDurationMinutes <= FALLBACK_MINIMUM_CHUNK_SIZE) {
    return buildSingleChunkPlan(task);
  }

  // 2. Compute minimum safe chunk size
  let minChunkSize = Math.max(task.minimumChunkSize, FALLBACK_MINIMUM_CHUNK_SIZE);
  if (task.requiresDeepWork) {
    minChunkSize = Math.max(minChunkSize, MINIMUM_DEEP_WORK_CHUNK_SIZE);
  }

  // 3. If the task is smaller than the minimum chunk size, do not split
  if (task.estimatedDurationMinutes <= minChunkSize) {
    return buildSingleChunkPlan(task);
  }

  // 4. Calculate chunk count
  let numChunks = Math.floor(task.estimatedDurationMinutes / minChunkSize);
  
  // Enforce global fragmentation limits
  if (numChunks > MAX_CHUNKS_PER_TASK) {
    numChunks = MAX_CHUNKS_PER_TASK;
  }

  // If division results in 1 chunk, fallback to single
  if (numChunks <= 1) {
    return buildSingleChunkPlan(task);
  }

  // 5. Distribute duration
  // We use a simple even distribution for determinism.
  // Any remainder minutes are distributed 1 minute at a time to earlier chunks.
  const baseDuration = Math.floor(task.estimatedDurationMinutes / numChunks);
  let remainder = task.estimatedDurationMinutes % numChunks;

  const chunks: TaskChunk[] = [];
  const dependencies: ChunkDependency[] = [];
  const dependencyGraph = new Map<string, string[]>();
  const reverseDependencyGraph = new Map<string, string[]>();

  for (let i = 0; i < numChunks; i++) {
    const chunkId = `${task.id}:chunk:${i}`;
    
    // Initialize lookup tables
    dependencyGraph.set(chunkId, []);
    reverseDependencyGraph.set(chunkId, []);
    
    let duration = baseDuration;
    if (remainder > 0) {
      duration += 1;
      remainder -= 1;
    }

    chunks.push({
      id: chunkId,
      unitType: "chunk",
      parentTaskId: task.id,
      chunkIndex: i,
      estimatedDurationMinutes: duration,
      isTerminalChunk: i === numChunks - 1,
      chunkStatus: "pending",

      // Inherit SchedulableUnit properties
      hardConstraints: task.hardConstraints,
      softConstraints: task.softConstraints,
      preferredTimeWindows: task.preferredTimeWindows,
      hardDeadline: task.hardDeadline,
      priorityScore: task.priorityScore,
      temporalFlexibility: task.temporalFlexibility,
      urgency: task.urgency,
      requiresDeepWork: task.requiresDeepWork,
      cognitiveLoad: task.cognitiveLoad,
      minimumChunkSize: task.minimumChunkSize,
      energyRequirement: task.energyRequirement
    });

    // Enforce sequential dependency with previous chunk
    if (i > 0) {
      const prevChunkId = `${task.id}:chunk:${i - 1}`;
      dependencies.push({
        parentChunkId: prevChunkId,
        childChunkId: chunkId,
        dependencyType: "sequential"
      });
      dependencyGraph.get(prevChunkId)!.push(chunkId);
      reverseDependencyGraph.get(chunkId)!.push(prevChunkId);
    }
  }

  return {
    taskId: task.id,
    originalDurationMinutes: task.estimatedDurationMinutes,
    chunks,
    dependencies,
    dependencyGraph,
    reverseDependencyGraph
  };
}

/**
 * Helper to build a unified plan for a task that cannot or should not be split.
 */
function buildSingleChunkPlan(task: SchedulableTask): ChunkedTaskPlan {
  const chunkId = `${task.id}:chunk:0`;
  
  const chunk: TaskChunk = {
    id: chunkId,
    unitType: "chunk",
    parentTaskId: task.id,
    chunkIndex: 0,
    estimatedDurationMinutes: task.estimatedDurationMinutes,
    isTerminalChunk: true,
    chunkStatus: "pending",

    // Inherit SchedulableUnit properties
    hardConstraints: task.hardConstraints,
    softConstraints: task.softConstraints,
    preferredTimeWindows: task.preferredTimeWindows,
    hardDeadline: task.hardDeadline,
    priorityScore: task.priorityScore,
    temporalFlexibility: task.temporalFlexibility,
    urgency: task.urgency,
    requiresDeepWork: task.requiresDeepWork,
    cognitiveLoad: task.cognitiveLoad,
    minimumChunkSize: task.minimumChunkSize,
    energyRequirement: task.energyRequirement
  };

  const dependencyGraph = new Map<string, string[]>();
  dependencyGraph.set(chunkId, []);
  
  const reverseDependencyGraph = new Map<string, string[]>();
  reverseDependencyGraph.set(chunkId, []);

  return {
    taskId: task.id,
    originalDurationMinutes: task.estimatedDurationMinutes,
    chunks: [chunk],
    dependencies: [],
    dependencyGraph,
    reverseDependencyGraph
  };
}
