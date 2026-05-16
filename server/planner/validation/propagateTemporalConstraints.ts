import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { CandidateSchedule, ScheduledTaskPlacement } from "../types/ScheduleGraphTypes";
import { ConstraintPropagationResult, TemporalPressureSignal } from "../types/ConstraintPropagationTypes";
import { MAX_PROPAGATION_DEPTH } from "../types/IncrementalRepairTypes";

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function propagateTemporalConstraints(
  schedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  logicalTick: number = 0
): ConstraintPropagationResult {
  const propagatedSignals: TemporalPressureSignal[] = [];
  const atRiskTasks = new Set<string>();
  const recommendedRepairPriority = new Set<string>();
  const reasoning: string[] = ["Initiated forward temporal risk propagation."];

  // Map for fast lookups
  const placementMap = new Map(schedule.scheduledPlacements.map(sp => [sp.task.id, sp]));
  const unitMap = new Map(units.map(u => [u.id, u]));

  // 1. Traverse placements and find initial pressure points
  for (const sp of schedule.scheduledPlacements) {
    const unit = unitMap.get(sp.task.id);
    if (!unit) continue;

    // A. Deadline Pressure
    if (unit.hardDeadlineMinute !== undefined) {
      const buffer = unit.hardDeadlineMinute - sp.placement.temporalWindow.endMinute;
      if (buffer < 60) {
        // High risk if < 60 mins buffer
        const pressureScore = clamp(1.0 - (buffer / 60));
        if (pressureScore > 0.2) {
          propagatedSignals.push({
            signalId: `sig-dl-${logicalTick}-${sp.task.id}`,
            type: "deadline_pressure",
            scope: "local",
            sourceChunkId: sp.task.id,
            affectedChunkIds: [],
            pressureScore,
            propagationDepth: 0,
            confidence: 0.9,
            reasoning: [`Chunk completes at ${sp.placement.temporalWindow.endMinute}, dangerously close to deadline ${unit.hardDeadlineMinute}`]
          });
          atRiskTasks.add(unit.id);
          recommendedRepairPriority.add(sp.task.id);
        }
      }
    }

    // B. Recovery Deficit & Focus Overload
    // Only start a chain from the earliest node (one without a deep-work predecessor)
    // to avoid emitting duplicate signals for every node in the same chain.
    if (unit.requiresDeepWork || (unit.cognitiveLoad && unit.cognitiveLoad >= 0.8)) {
      const predecessors = context.dependencyGraph ? 
        Array.from<[string, string[]]>(context.dependencyGraph.entries())
          .filter(([, deps]) => deps.includes(sp.task.id))
          .map(([id]) => id) : [];
      
      // Skip if this node has a deep-work predecessor already in schedule (avoid duplicate chain starts)
      const hasDeepWorkPredecessor = predecessors.some(predId => {
        const predUnit = unitMap.get(predId);
        return predUnit && (predUnit.requiresDeepWork || (predUnit.cognitiveLoad && predUnit.cognitiveLoad >= 0.8));
      });
      
      if (!hasDeepWorkPredecessor) {
        // BFS: traverse the full consecutive deep-work chain starting from here
        let continuousDeepWorkMinutes = sp.placement.temporalWindow.durationMinutes;
        const overloadChain = [sp.task.id];
        let frontier = [sp.task.id];

        while (frontier.length > 0) {
          const nextFrontier: string[] = [];
          for (const nodeId of frontier) {
            const nodeDesc = context.dependencyGraph?.get(nodeId) || [];
            const nodePlacement = placementMap.get(nodeId);
            
            for (const descendantId of nodeDesc) {
              const descPlacement = placementMap.get(descendantId);
              const descUnit = unitMap.get(descendantId);
              if (descPlacement && descUnit && 
                  (descUnit.requiresDeepWork || (descUnit.cognitiveLoad && descUnit.cognitiveLoad >= 0.8)) &&
                  !overloadChain.includes(descendantId)) {
                // Check chronological adjacency (gap <= 30m)
                const prevEnd = nodePlacement?.placement.temporalWindow.endMinute ?? 0;
                const gap = descPlacement.placement.temporalWindow.startMinute - prevEnd;
                if (gap >= 0 && gap <= 30) {
                  continuousDeepWorkMinutes += descPlacement.placement.temporalWindow.durationMinutes;
                  overloadChain.push(descendantId);
                  nextFrontier.push(descendantId);
                }
              }
            }
          }
          frontier = nextFrontier;
        }

        if (continuousDeepWorkMinutes > 150) { // 2.5 hours of continuous high cognitive load
          propagatedSignals.push({
            signalId: `sig-fo-${logicalTick}-${sp.task.id}`,
            type: "focus_overload",
            scope: "regional",
            sourceChunkId: sp.task.id,
            affectedChunkIds: overloadChain.slice(1),
            pressureScore: clamp((continuousDeepWorkMinutes - 150) / 100),
            propagationDepth: overloadChain.length - 1,
            confidence: 0.85,
            reasoning: [`Continuous high-cognitive load chain (${overloadChain.join("→")}) exceeds safe limits (${continuousDeepWorkMinutes}m)`]
          });
          overloadChain.forEach(id => atRiskTasks.add(id));
        }
      }
    }
  }

  // 2. Graph Traversal: Propagate risks downstream (Dependency Backlog)
  const signalsToPropagate = propagatedSignals.filter(sig => sig.type === "deadline_pressure" || sig.type === "focus_overload");
  
  for (const signal of signalsToPropagate) {
    let currentDepth = signal.propagationDepth;
    let currentSources = [signal.sourceChunkId, ...signal.affectedChunkIds];

    while (currentDepth < MAX_PROPAGATION_DEPTH && currentSources.length > 0) {
      const nextWave: string[] = [];
      
      for (const sourceId of currentSources) {
        const descendants = context.dependencyGraph?.get(sourceId) || [];
        for (const descendantId of descendants) {
          const descPlacement = placementMap.get(descendantId);
          if (descPlacement && !signal.affectedChunkIds.includes(descendantId)) {
            signal.affectedChunkIds.push(descendantId);
            atRiskTasks.add(descendantId);
            nextWave.push(descendantId);
            
            // Attenuate pressure score linearly as it propagates
            const attenuatedScore = clamp(signal.pressureScore * (1.0 - (currentDepth * 0.15)));
            
            // If the pressure is still significant, queue it up for repair recommendation
            if (attenuatedScore > 0.4) {
              recommendedRepairPriority.add(descendantId);
            }
          }
        }
      }
      currentSources = nextWave;
      currentDepth++;
      signal.propagationDepth = Math.max(signal.propagationDepth, currentDepth);
    }
  }

  // 3. Fragmentation Spike Detection
  const sortedPlacements = [...schedule.scheduledPlacements].sort((a, b) => a.placement.temporalWindow.startMinute - b.placement.temporalWindow.startMinute);
  let fragmentationCount = 0;
  for (let i = 0; i < sortedPlacements.length - 1; i++) {
    const gap = sortedPlacements[i+1].placement.temporalWindow.startMinute - sortedPlacements[i].placement.temporalWindow.endMinute;
    if (gap > 0 && gap < 25) {
      // Tiny unusable gap
      fragmentationCount++;
    }
  }

  if (fragmentationCount > 3) {
    propagatedSignals.push({
      signalId: `sig-fs-${logicalTick}`,
      type: "fragmentation_spike",
      scope: "global",
      sourceChunkId: "schedule",
      affectedChunkIds: [],
      pressureScore: clamp((fragmentationCount - 3) / 5),
      propagationDepth: 0,
      confidence: 0.9,
      reasoning: [`Detected ${fragmentationCount} micro-gaps (< 25m) causing fragmentation risk`]
    });
  }

  // 4. Global Risk Assessment
  let stabilityRiskScore = 0;
  if (propagatedSignals.length > 0) {
    const totalPressure = propagatedSignals.reduce((sum, sig) => sum + (sig.pressureScore * sig.confidence), 0);
    // Deterministic heuristic mapping total pressure to a bounded risk score
    stabilityRiskScore = clamp(1.0 - Math.exp(-0.5 * totalPressure));
    reasoning.push(`Calculated global stability risk score: ${Number(stabilityRiskScore.toFixed(2))} based on ${propagatedSignals.length} risk vectors.`);
  } else {
    reasoning.push("No significant temporal pressures detected. Topology is stable.");
  }

  return {
    evaluationId: `prop-eval-${logicalTick}`,
    logicalTick,
    propagatedSignals,
    atRiskTasks: Array.from(atRiskTasks),
    stabilityRiskScore: Number(stabilityRiskScore.toFixed(3)),
    recommendedRepairPriority: Array.from(recommendedRepairPriority),
    reasoning
  };
}
