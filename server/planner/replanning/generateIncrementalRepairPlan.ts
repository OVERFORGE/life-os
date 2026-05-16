import { PlacementAnalysisContext, SchedulableUnit, PlacementAnchorType } from "../types/SchedulingTypes";
import { CandidateSchedule, ScheduledTaskPlacement } from "../types/ScheduleGraphTypes";
import { IncrementalRepairPlan, RepairOperation, RepairTrigger, MAX_REPAIR_RADIUS, MAX_REPAIR_OPERATIONS_PER_CYCLE } from "../types/IncrementalRepairTypes";
import { calculateTemporalOverlap, createTemporalWindow, TemporalWindow } from "../utils/TemporalWindow";
import { generateCandidateSchedules } from "../scheduling/generateCandidateSchedules";

function shiftTemporalWindow(window: TemporalWindow, minutes: number): TemporalWindow | null {
  const newStart = window.startMinute + minutes;
  const newEnd = window.endMinute + minutes;
  // Clamp to valid day bounds — out-of-range shifts cannot be represented on this day
  if (newStart < 0 || newStart > 1439 || newEnd < 1 || newEnd > 1440) return null;
  return createTemporalWindow(newStart, newEnd);
}

export interface RepairEngineOutput {
  plan: IncrementalRepairPlan;
  schedule: CandidateSchedule;
}

/**
 * Phase 3A: Incremental Replanning Engine
 * 
 * Performs localized schedule repair by isolating the affected "blast radius"
 * of a trigger, freezing the rest of the schedule, and re-orchestrating only
 * the affected sub-graph.
 */
export function generateIncrementalRepairPlan(
  currentSchedule: CandidateSchedule,
  trigger: RepairTrigger,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  anchors: Map<string, PlacementAnchorType> = new Map()
): RepairEngineOutput {
  
  const operations: RepairOperation[] = [];
  const reasoning: string[] = [`Initiated localized repair for trigger: ${trigger.type}`];
  const topologyChanges: string[] = [];
  
  // 1. Identify the immediate affected units based on the trigger
  const affectedUnitIds = new Set<string>();
  let anomalyShiftMinutes = trigger.anomalyMagnitudeMinutes || 0;

  if (trigger.sourceChunkId) {
    if (trigger.type === "chunk_overran" || trigger.type === "task_interrupted") {
      // Find what the source overlaps with NOW
      const sourcePlacement = currentSchedule.scheduledPlacements.find(sp => sp.task.id === trigger.sourceChunkId);
      if (sourcePlacement && anomalyShiftMinutes > 0) {
        const shiftedWindow = shiftTemporalWindow(sourcePlacement.placement.temporalWindow, anomalyShiftMinutes);
        
        // Find chronologically overlapping placements (null means shift goes off-day, skip)
        if (shiftedWindow) {
          currentSchedule.scheduledPlacements.forEach(sp => {
            if (sp.task.id !== trigger.sourceChunkId) {
              const overlap = calculateTemporalOverlap(shiftedWindow, sp.placement.temporalWindow);
              if (overlap.overlapMinutes > 0) {
                affectedUnitIds.add(sp.task.id);
                topologyChanges.push(`Collision detected: ${trigger.sourceChunkId} overrun into ${sp.task.id}`);
              }
            }
          });
        }
      }

      // Add direct topological descendants
      const descendants = context.dependencyGraph?.get(trigger.sourceChunkId) || [];
      descendants.forEach(d => {
        affectedUnitIds.add(d);
        topologyChanges.push(`Topological propagation: ${trigger.sourceChunkId} -> ${d}`);
      });
    }
  }

  // 2. Expand Blast Radius (up to MAX_REPAIR_RADIUS)
  // We iteratively find overlaps that would happen if we push the affected units forward
  let currentRadius = 1;
  let newlyAdded = Array.from(affectedUnitIds);

  while (currentRadius < MAX_REPAIR_RADIUS && newlyAdded.length > 0) {
    const nextWave = new Set<string>();
    
    for (const unitId of newlyAdded) {
      // Topological propagation
      const descendants = context.dependencyGraph?.get(unitId) || [];
      for (const d of descendants) {
        if (!affectedUnitIds.has(d)) {
          nextWave.add(d);
          topologyChanges.push(`Radius ${currentRadius} propagation: ${unitId} -> ${d}`);
        }
      }

      // Chronological propagation (heuristic: if it shifts, what does it hit?)
      const sp = currentSchedule.scheduledPlacements.find(p => p.task.id === unitId);
      if (sp) {
        const shifted = shiftTemporalWindow(sp.placement.temporalWindow, anomalyShiftMinutes);
        // null means shift goes off-day — no chronological collision possible
        if (shifted) {
          currentSchedule.scheduledPlacements.forEach(otherSp => {
            if (!affectedUnitIds.has(otherSp.task.id) && !nextWave.has(otherSp.task.id)) {
              const overlap = calculateTemporalOverlap(shifted, otherSp.placement.temporalWindow);
              if (overlap.overlapMinutes > 0) {
                // Check if anchor prevents movement
                const anchor = anchors.get(otherSp.task.id);
                if (anchor === "fixed") {
                  // Fixed anchor stops the chronological ripple
                  topologyChanges.push(`Rippling stopped at ${otherSp.task.id} (fixed anchor)`);
                } else {
                  nextWave.add(otherSp.task.id);
                }
              }
            }
          });
        }
      }
    }

    newlyAdded = Array.from(nextWave);
    newlyAdded.forEach(id => affectedUnitIds.add(id));
    currentRadius++;

    if (affectedUnitIds.size >= MAX_REPAIR_OPERATIONS_PER_CYCLE) {
      reasoning.push(`Hit MAX_REPAIR_OPERATIONS_PER_CYCLE (${MAX_REPAIR_OPERATIONS_PER_CYCLE}). Truncating blast radius.`);
      break;
    }
  }

  // 3. Freeze Unaffected Placements
  const frozenPlacements: ScheduledTaskPlacement[] = [];
  const affectedUnits: SchedulableUnit[] = [];
  const preservedPlacementIds: string[] = [];

  for (const sp of currentSchedule.scheduledPlacements) {
    if (affectedUnitIds.has(sp.task.id)) {
      const unit = units.find(u => u.id === sp.task.id);
      if (unit) affectedUnits.push(unit);
    } else {
      let frozenSp = sp;
      if (trigger.sourceChunkId === sp.task.id && trigger.type === "chunk_overran" && anomalyShiftMinutes > 0) {
        // Overrun means the task took longer, so extend the endMinute
        const newEnd = sp.placement.temporalWindow.endMinute + anomalyShiftMinutes;
        if (newEnd <= 1440) {
           frozenSp = {
             ...sp,
             placement: {
               ...sp.placement,
               temporalWindow: createTemporalWindow(sp.placement.temporalWindow.startMinute, newEnd)
             }
           };
        }
      }
      frozenPlacements.push(frozenSp);
      preservedPlacementIds.push(sp.task.id);
    }
  }

  // Add any affected units that were completely unscheduled previously
  for (const unitId of affectedUnitIds) {
    if (!currentSchedule.scheduledPlacements.some(sp => sp.task.id === unitId)) {
      const unit = units.find(u => u.id === unitId);
      if (unit && !affectedUnits.some(u => u.id === unitId)) {
        affectedUnits.push(unit);
      }
    }
  }

  if (affectedUnits.length === 0) {
    reasoning.push("No units affected. Repair returns existing schedule.");
    return {
      plan: {
        planId: `repair-${trigger.triggerId}`,
        trigger,
        affectedChunkIds: [],
        affectedTaskIds: [],
        operations: [],
        topologyChanges,
        preservedPlacements: preservedPlacementIds,
        displacedPlacements: [],
        stabilityDelta: 0,
        confidenceDelta: 0,
        reasoning
      },
      schedule: currentSchedule
    };
  }

  // 4. Create Context with Frozen Exclusion Zones
  const repairContext: PlacementAnalysisContext = {
    ...context,
    recurringConstraints: [
      ...(context.recurringConstraints || []),
      ...frozenPlacements.map(fp => ({
        window: fp.placement.temporalWindow,
        daysOfWeek: [fp.placement.dayOfWeek],
        constraintType: "hard" as const,
        constraintStrength: 1.0,
        confidence: 1.0,
        sourceSignals: [`frozen_placement:${fp.task.id}`]
      }))
    ]
  };

  // 5. Inject Sticky/Fixed Anchor preferences for affected units (if any were forced into the radius)
  const reOrchestrationUnits = affectedUnits.map(unit => {
    const prevSP = currentSchedule.scheduledPlacements.find(sp => sp.task.id === unit.id);
    const anchor = anchors.get(unit.id);
    
    if (prevSP && (anchor === "fixed" || anchor === "sticky")) {
      return {
        ...unit,
        preferredTimeWindows: [
          ...(unit.preferredTimeWindows || []),
          prevSP.placement.temporalWindow
        ]
      };
    }
    return unit;
  });

  // 6. Generate Sub-Schedule
  const candidateSubSchedules = generateCandidateSchedules(reOrchestrationUnits, repairContext);
  
  if (candidateSubSchedules.length === 0) {
    throw new Error("Repair engine failed to generate any valid sub-schedules.");
  }
  
  const bestSubSchedule = candidateSubSchedules[0];

  // 7. Re-integrate and Calculate Deltas
  const finalPlacements = [...frozenPlacements, ...bestSubSchedule.scheduledPlacements];
  
  // Sort chronologically
  finalPlacements.sort((a, b) => a.placement.temporalWindow.startMinute - b.placement.temporalWindow.startMinute);

  const finalSchedule: CandidateSchedule = {
    scheduleId: `repaired-${trigger.triggerId}`,
    scheduledPlacements: finalPlacements,
    unscheduledTaskIds: [...currentSchedule.unscheduledTaskIds, ...bestSubSchedule.unscheduledTaskIds],
    conflicts: [...currentSchedule.conflicts],
    scheduleScore: 0,
    confidence: 0,
    stabilityScore: 0,
    focusScore: 0,
    fragmentationScore: 0,
    recoverySafetyScore: 0,
    coverageRatio: 0,
    seedStrategy: "urgency_first",
    penaltiesApplied: [],
    boostsApplied: [],
    reasoning: [...(currentSchedule.reasoning || []), `Repaired via trigger: ${trigger.type}`]
  };

  // Re-aggregate metrics
  if (finalPlacements.length > 0) {
    let totalScore = 0;
    let totalConf = 0;
    let totalStab = 0;
    finalPlacements.forEach(sp => {
      totalScore += sp.placement.placementScore;
      totalConf += sp.placement.confidence;
      totalStab += sp.placement.stabilityScore;
    });
    finalSchedule.scheduleScore = totalScore / finalPlacements.length;
    finalSchedule.confidence = totalConf / finalPlacements.length;
    finalSchedule.stabilityScore = totalStab / finalPlacements.length;
    finalSchedule.coverageRatio = finalPlacements.length / (finalPlacements.length + finalSchedule.unscheduledTaskIds.length);
  }

  // 8. Generate Operations Log
  const displacedPlacements: string[] = [...bestSubSchedule.unscheduledTaskIds];
  
  bestSubSchedule.scheduledPlacements.forEach(newSP => {
    const oldSP = currentSchedule.scheduledPlacements.find(sp => sp.task.id === newSP.task.id);
    if (!oldSP) {
      operations.push({
        operationId: `op-${trigger.triggerId}-${newSP.task.id}`,
        type: "move_chunk",
        targetChunkId: newSP.task.id,
        newPlacementId: newSP.placement.temporalWindow.startMinute.toString(),
        affectedDependencyEdges: context.dependencyGraph?.get(newSP.task.id) || [],
        downstreamAffectedChunkIds: context.dependencyGraph?.get(newSP.task.id) || [],
        stabilityImpact: newSP.placement.stabilityScore,
        confidenceImpact: newSP.placement.confidence,
        repairCost: 0.1, // Placeholder: basic placement has low topological cost
        reasoning: ["Placed previously unscheduled chunk"]
      });
    } else {
      // Check if it moved
      if (oldSP.placement.temporalWindow.startMinute !== newSP.placement.temporalWindow.startMinute) {
        const opType = (newSP.placement.temporalWindow.startMinute > oldSP.placement.temporalWindow.startMinute) 
          ? "defer_chunk" : "move_chunk";
          
        operations.push({
          operationId: `op-${trigger.triggerId}-${newSP.task.id}`,
          type: opType,
          targetChunkId: newSP.task.id,
          previousPlacementId: oldSP.placement.temporalWindow.startMinute.toString(),
          newPlacementId: newSP.placement.temporalWindow.startMinute.toString(),
          affectedDependencyEdges: context.dependencyGraph?.get(newSP.task.id) || [],
          downstreamAffectedChunkIds: context.dependencyGraph?.get(newSP.task.id) || [],
          stabilityImpact: newSP.placement.stabilityScore - oldSP.placement.stabilityScore,
          confidenceImpact: newSP.placement.confidence - oldSP.placement.confidence,
          repairCost: 0.3, // Placeholder: moderate cost for shifting an existing chunk
          reasoning: [`Shifted from ${oldSP.placement.temporalWindow.startMinute} to ${newSP.placement.temporalWindow.startMinute}`]
        });
      } else {
        preservedPlacementIds.push(newSP.task.id);
      }
    }
  });

  bestSubSchedule.unscheduledTaskIds.forEach(id => {
    operations.push({
      operationId: `op-${trigger.triggerId}-${id}`,
      type: "defer_chunk",
      targetChunkId: id,
      affectedDependencyEdges: context.dependencyGraph?.get(id) || [],
      downstreamAffectedChunkIds: context.dependencyGraph?.get(id) || [],
      stabilityImpact: -0.5,
      confidenceImpact: -0.2,
      repairCost: 0.8, // Placeholder: high cost for deferring a chunk
      reasoning: ["Displaced from schedule due to tight constraints"]
    });
  });

  const plan: IncrementalRepairPlan = {
    planId: `plan-${trigger.triggerId}`,
    trigger,
    affectedChunkIds: Array.from(affectedUnitIds),
    affectedTaskIds: Array.from(new Set(Array.from(affectedUnitIds).map(id => id.split(":")[0]))),
    operations,
    topologyChanges,
    preservedPlacements: preservedPlacementIds,
    displacedPlacements,
    stabilityDelta: finalSchedule.stabilityScore - currentSchedule.stabilityScore,
    confidenceDelta: finalSchedule.confidence - currentSchedule.confidence,
    reasoning
  };

  return { plan, schedule: finalSchedule };
}
