import { SpecialistOutput } from "../contracts/AgentContracts";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { ObservationRecord, EstimateRecord, HypothesisRecord } from "../contracts/EpistemicTypes";
import { ConflictResolutionPolicy, ConflictRecord } from "./ConflictResolutionPolicy";
import { generateId } from "../../shared/ids";

export interface SynthesisResult {
  synthesisId: string;
  summary: string;
  approvedProposals: ActionProposal[];
  conflicts: ConflictRecord[];
  combinedObservations: ObservationRecord[];
  combinedEstimates: EstimateRecord[];
  combinedHypotheses: HypothesisRecord[];
  confidence: number;
}

/**
 * SynthesisEngine
 * 
 * Aggregates findings and proposals from parallel specialist agents.
 * Detects cross-domain conflicts and resolves them using ConflictResolutionPolicy.
 * Invariant 4: Conflict resolution strictly respects the approved policy hierarchy.
 */
export class SynthesisEngine {
  constructor(private conflictPolicy: ConflictResolutionPolicy = new ConflictResolutionPolicy()) {}

  synthesize(
    specialistOutputs: SpecialistOutput[],
    userIntent: string
  ): SynthesisResult {
    const synthesisId = generateId("syn");

    const combinedObservations: ObservationRecord[] = [];
    const combinedEstimates: EstimateRecord[] = [];
    const combinedHypotheses: HypothesisRecord[] = [];
    const allProposals: ActionProposal[] = [];

    let totalConfidence = 0;
    for (const output of specialistOutputs) {
      if (output.observations) combinedObservations.push(...output.observations);
      if (output.estimates) combinedEstimates.push(...output.estimates);
      if (output.hypotheses) combinedHypotheses.push(...output.hypotheses);
      if (output.proposals) allProposals.push(...output.proposals);
      totalConfidence += output.confidence ?? 0.8;
    }

    const avgConfidence = specialistOutputs.length > 0
      ? totalConfidence / specialistOutputs.length
      : 0.5;

    // Detect potential cross-domain conflicts (e.g. Recovery vs Workload)
    const recoveryProposals = allProposals.filter(
      (p) => p.actionType === "apply_recovery_constraint" || p.domain === "wellness"
    );
    const heavyWorkloadProposals = allProposals.filter(
      (p) => (p.actionType === "adjust_task_priority" && p.payload?.priority === "urgent") ||
             p.actionType === "reschedule_task"
    );

    const conflicts: ConflictRecord[] = [];
    let approvedProposals: ActionProposal[] = [];

    // Check if Wellness/Health requires rest while Productivity proposes intense focus
    const hasSevereDeficit = specialistOutputs.some((o) =>
      (o.domain === "wellness" || o.domain === "health") &&
      o.proposals.some((p) => p.actionType === "apply_recovery_constraint")
    );

    if (hasSevereDeficit && heavyWorkloadProposals.length > 0) {
      // Conflict detected! TC-04
      const conflict = this.conflictPolicy.resolveRecoveryVsWorkloadConflict(
        recoveryProposals,
        heavyWorkloadProposals,
        "Physiological deficit detected"
      );
      conflicts.push(conflict);

      // Filter proposals: keep approved, remove suppressed
      const suppressedIds = new Set(conflict.suppressedProposals.map((p) => p.id));
      approvedProposals = allProposals.filter((p) => !suppressedIds.has(p.id));
    } else {
      approvedProposals = [...allProposals];
    }

    const summaries = specialistOutputs.map((o) => `${o.domain}: ${o.summary}`).join("; ");
    const summary = conflicts.length > 0
      ? `Synthesized with ${conflicts.length} conflict(s) resolved via policy hierarchy. ${summaries}`
      : `Synthesized recommendations across ${specialistOutputs.length} specialist(s). ${summaries}`;

    return {
      synthesisId,
      summary,
      approvedProposals,
      conflicts,
      combinedObservations,
      combinedEstimates,
      combinedHypotheses,
      confidence: avgConfidence,
    };
  }
}
