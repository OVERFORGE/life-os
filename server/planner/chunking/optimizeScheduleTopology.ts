import { ChunkedTaskPlan, TaskChunk } from "../types/ChunkGraphTypes";
import { RawExecutionData, TaskExecutionState } from "../replanning/analyzeScheduleDrift";
import { MAX_CHUNK_PROLIFERATION } from "../types/IncrementalRepairTypes";
import { validateAcyclicGraph } from "../validation/validateAcyclicGraph";

export interface TopologyOptimizationResult {
  planId: string;
  originalTaskId: string;
  optimizedPlan: ChunkedTaskPlan;
  topologyChanges: string[];
  isRestructured: boolean;
}

export interface OptimizationConfig {
  isAsyncMaintenance: boolean;
  absoluteMaxChunkSizeMinutes?: number; // Bounded adaptive ceiling
}

/**
 * Phase 3C: Adaptive Topology Optimization
 * 
 * Dynamically restructures chunk graphs (resizing, merging, splitting) based
 * on execution drift metrics. Maintains deterministic topology.
 */
export function optimizeScheduleTopology(
  currentPlan: ChunkedTaskPlan,
  executionStates: TaskExecutionState[],
  config: OptimizationConfig
): TopologyOptimizationResult {
  const topologyChanges: string[] = [];
  const state = executionStates.find(s => s.taskId === currentPlan.taskId);
  
  // If no execution data exists yet, topology is considered optimal as generated
  if (!state) {
    return {
      planId: `opt-${Date.now()}`,
      originalTaskId: currentPlan.taskId,
      optimizedPlan: currentPlan,
      topologyChanges: ["No execution history available. Retaining original topology."],
      isRestructured: false
    };
  }

  // 1. Adaptive Chunk Resizing Constraints
  // We use the first chunk as the reference since chunks are generally uniform
  const referenceChunk = currentPlan.chunks[0];
  const minSafeSize = referenceChunk.minimumChunkSize || 15;
  const maxSafeSize = config.absoluteMaxChunkSizeMinutes || (referenceChunk.requiresDeepWork ? 180 : 90);
  
  let currentAverageSize = 0;
  if (currentPlan.chunks.length > 0) {
    currentAverageSize = currentPlan.chunks.reduce((sum, c) => sum + c.estimatedDurationMinutes, 0) / currentPlan.chunks.length;
  }

  let targetChunkSize = currentAverageSize;

  // 2. Evaluate execution telemetry for resizing
  // High instability + high underestimation -> task is fragmented in reality, chunks should be smaller
  if (state.focusInstabilityScore > 0.6 && state.underestimationBias > 1.2) {
    targetChunkSize = currentAverageSize * 0.7; // Shrink by 30%
    topologyChanges.push(`High instability (${state.focusInstabilityScore.toFixed(2)}) detected. Shrinking chunks.`);
  } 
  // Very stable + Deep Work -> User is locking in well, we can expand chunks to reduce context switching overhead
  else if (state.focusInstabilityScore < 0.25 && referenceChunk.requiresDeepWork) {
    targetChunkSize = currentAverageSize * 1.3; // Expand by 30%
    topologyChanges.push(`Stable deep-work execution detected. Expanding chunks for cognitive continuity.`);
  }

  // Bound the target size
  targetChunkSize = Math.max(minSafeSize, Math.min(targetChunkSize, maxSafeSize));

  // 3. Prevent topology explosion (MAX_CHUNK_PROLIFERATION)
  let totalRemainingMinutes = currentPlan.chunks
    .filter(c => c.chunkStatus !== "completed")
    .reduce((sum, c) => sum + c.estimatedDurationMinutes, 0);

  let projectedChunkCount = Math.ceil(totalRemainingMinutes / targetChunkSize);
  
  if (projectedChunkCount > MAX_CHUNK_PROLIFERATION) {
    projectedChunkCount = MAX_CHUNK_PROLIFERATION;
    targetChunkSize = totalRemainingMinutes / projectedChunkCount;
    topologyChanges.push(`Chunk proliferation capped at ${MAX_CHUNK_PROLIFERATION}. Force-bounding chunk size to ${targetChunkSize.toFixed(1)}m.`);
  }

  // 4. Async Maintenance: Fragmentation Reduction
  // If we are doing background cleanup, and chunks are smaller than they need to be (e.g. 15m)
  // but the user has proven highly stable, we proactively merge them to simplify the graph.
  if (config.isAsyncMaintenance && state.focusInstabilityScore < 0.15) {
    const idealMergeSize = Math.min(maxSafeSize, currentAverageSize * 1.5);
    if (targetChunkSize < idealMergeSize) {
      targetChunkSize = idealMergeSize;
      topologyChanges.push(`Async Maintenance: Proactively merging stable chunks to reduce schedule fragmentation.`);
    }
  }

  // Check if restructuring is actually mathematically meaningful (>15% change)
  const sizeDiffRatio = Math.abs(targetChunkSize - currentAverageSize) / currentAverageSize;
  if (sizeDiffRatio < 0.15 || Number.isNaN(sizeDiffRatio)) {
    return {
      planId: `opt-${Date.now()}`,
      originalTaskId: currentPlan.taskId,
      optimizedPlan: currentPlan,
      topologyChanges: ["Topology is within optimal bounds. No restructuring needed."],
      isRestructured: false
    };
  }

  // 5. Rebuild the ChunkedTaskPlan Topologies
  const newChunks: TaskChunk[] = [];
  const dependencyGraph = new Map<string, string[]>();
  const reverseDependencyGraph = new Map<string, string[]>();
  const dependencies: any[] = [];

  // We only restructure the pending/remaining duration. 
  // Any completed chunks are discarded from the new pending plan (or rather, the new plan represents the remaining future).
  let remainingToDistribute = totalRemainingMinutes;
  let chunkIndex = 0;

  // We append a generation nonce to chunk IDs if they are restructured to prevent ID collisions with old stale placements
  const structureGen = Date.now().toString().slice(-4);

  while (remainingToDistribute > 0 && chunkIndex < MAX_CHUNK_PROLIFERATION) {
    let alloc = Math.floor(targetChunkSize);
    if (remainingToDistribute - alloc < minSafeSize && remainingToDistribute - alloc > 0) {
      // If the remainder is too small to form its own chunk, just absorb it into this one
      alloc = remainingToDistribute;
    }
    if (alloc > remainingToDistribute) {
      alloc = remainingToDistribute;
    }

    const chunkId = `${currentPlan.taskId}:chunk:g${structureGen}:${chunkIndex}`;
    
    dependencyGraph.set(chunkId, []);
    reverseDependencyGraph.set(chunkId, []);

    newChunks.push({
      ...referenceChunk,
      id: chunkId,
      chunkIndex: chunkIndex,
      estimatedDurationMinutes: alloc,
      isTerminalChunk: false, // Updated after loop
      chunkStatus: "pending"
    });

    if (chunkIndex > 0) {
      const prevChunkId = newChunks[chunkIndex - 1].id;
      dependencies.push({
        parentChunkId: prevChunkId,
        childChunkId: chunkId,
        dependencyType: "sequential"
      });
      dependencyGraph.get(prevChunkId)!.push(chunkId);
      reverseDependencyGraph.get(chunkId)!.push(prevChunkId);
    }

    remainingToDistribute -= alloc;
    chunkIndex++;
  }

  // Mark the last chunk
  if (newChunks.length > 0) {
    newChunks[newChunks.length - 1].isTerminalChunk = true;
  }

  const optimizedPlan: ChunkedTaskPlan = {
    taskId: currentPlan.taskId,
    originalDurationMinutes: currentPlan.originalDurationMinutes,
    chunks: newChunks,
    dependencies,
    dependencyGraph,
    reverseDependencyGraph
  };

  const validation = validateAcyclicGraph(dependencyGraph);
  if (!validation.valid) {
    throw new Error(`DAG violation detected during topology optimization for ${currentPlan.taskId}. Cycle path: ${validation.cyclePath?.join(' -> ')}`);
  }

  topologyChanges.push(`Successfully restructured topology: ${currentPlan.chunks.length} chunks -> ${newChunks.length} chunks.`);

  return {
    planId: `opt-${Date.now()}`,
    originalTaskId: currentPlan.taskId,
    optimizedPlan,
    topologyChanges,
    isRestructured: true
  };
}
