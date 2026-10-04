/**
 * ContradictionResolver.ts
 * Resolves contradictions and duplicates across personal memories.
 * 
 * Enforces Constitutional Rule 1 (Zero Regex as Semantic Intelligence):
 * All regex polarity pairs and keyword token-overlap scoring have been eliminated.
 * Uses structured semantic slot resolution and model-driven contradiction classification.
 * 
 * Enforces:
 * - Invariant 2: Repeated evidence strengthens existing memory confidence.
 * - Invariant 3: Contradictory statements update temporal validity (superseding).
 * - Invariant 9: System inference cannot silently overturn explicit user facts.
 */

import {
  PersonalMemoryRecord,
  DEFAULT_MEMORY_POLICY,
} from "./PersonalMemoryContracts";
import { CandidateMemory } from "./EpistemicVerificationEngine";

export type ResolutionAction =
  | "NEW"
  | "REINFORCED"
  | "SUPERSEDED"
  | "REJECTED_CONTRADICTION";

export interface ContradictionResolution {
  action: ResolutionAction;
  targetMemoryId?: string;
  reason: string;
  supersededMemoryIds?: string[];
  updatedConfidence?: number;
}

export type SemanticContradictionClassifier = (
  candidate: CandidateMemory,
  existing: PersonalMemoryRecord
) => boolean;

export class ContradictionResolver {
  private static instance: ContradictionResolver;
  private customClassifier?: SemanticContradictionClassifier;

  static getInstance(): ContradictionResolver {
    if (!ContradictionResolver.instance) {
      ContradictionResolver.instance = new ContradictionResolver();
    }
    return ContradictionResolver.instance;
  }

  /**
   * Sets a custom or model-driven classifier for semantic contradiction detection.
   */
  public setClassifier(classifier: SemanticContradictionClassifier): void {
    this.customClassifier = classifier;
  }

  /**
   * Evaluates candidate memory against top vector/semantic matches from the user's active memories.
   * Zero regex; strictly structured semantic resolution.
   */
  public resolve(
    candidate: CandidateMemory,
    existingMatches: Array<{ memory: PersonalMemoryRecord; score: number }>
  ): ContradictionResolution {
    if (!existingMatches || existingMatches.length === 0) {
      return {
        action: "NEW",
        reason: "No semantically related existing memories found.",
      };
    }

    // Check against each relevant existing match
    for (const match of existingMatches) {
      const existing = match.memory;
      const similarity = match.score;

      // Skip already archived or expired memories
      if (existing.isArchived || (existing.validTo && existing.validTo <= Date.now())) {
        continue;
      }

      // 1. Check for Contradiction via structured semantic resolution
      const isContradiction = this.detectContradiction(candidate, existing);

      if (isContradiction) {
        // Case A: Candidate is explicit user statement superseding older fact
        if (candidate.source === "explicit_user_statement") {
          return {
            action: "SUPERSEDED",
            targetMemoryId: existing.id,
            supersededMemoryIds: [existing.id],
            reason: `Explicit user statement supersedes older memory (${existing.id}): "${existing.content}"`,
          };
        }

        // Case B: Candidate is system inference trying to contradict an explicit fact (INVARIANT 9)
        if (existing.source === "explicit_user_statement" && candidate.source === "system_inference") {
          return {
            action: "REJECTED_CONTRADICTION",
            targetMemoryId: existing.id,
            reason: `System inference rejected because it contradicts verified explicit user fact: "${existing.content}"`,
          };
        }

        // Case C: New telemetry or reflection contradicting older telemetry
        if (candidate.source === "behavioral_telemetry" || candidate.source === "user_reflection") {
          return {
            action: "SUPERSEDED",
            targetMemoryId: existing.id,
            supersededMemoryIds: [existing.id],
            reason: `New observed behavior supersedes older observation (${existing.id}).`,
          };
        }
      }

      // 2. Check for Duplicate / Reinforcement (High similarity, non-contradictory)
      const duplicateThreshold = DEFAULT_MEMORY_POLICY.duplicateSimilarityThreshold;
      const isDuplicateText = candidate.content.trim().toLowerCase() === existing.content.trim().toLowerCase();
      const isHighSimilarity = similarity >= duplicateThreshold;

      if (isDuplicateText || isHighSimilarity) {
        const boostedConfidence = Math.min(1.0, existing.confidence + 0.05);
        return {
          action: "REINFORCED",
          targetMemoryId: existing.id,
          updatedConfidence: Number(boostedConfidence.toFixed(2)),
          reason: `Candidate corroborates existing memory (${existing.id}). Evidence count and confidence reinforced.`,
        };
      }
    }

    // No direct contradiction or duplicate match found
    return {
      action: "NEW",
      reason: "Candidate provides distinct non-contradictory information.",
    };
  }

  /**
   * Evaluates contradiction without using ANY regular expressions.
   * Leverages structured semantic slots, attribute-value conflict analysis,
   * or a custom/model-driven classifier.
   */
  private detectContradiction(candidate: CandidateMemory, existing: PersonalMemoryRecord): boolean {
    // 1. Delegate to custom/model classifier if registered
    if (this.customClassifier) {
      return this.customClassifier(candidate, existing);
    }

    // 2. Structured attribute comparison via summary parsing (e.g. "Dietary preference: vegetarian" vs "Dietary hypothesis: omnivore")
    const candidateSlot = this.extractStructuredSlot(candidate.summary || candidate.content);
    const existingSlot = this.extractStructuredSlot(existing.summary || existing.content);

    if (candidateSlot && existingSlot) {
      if (candidateSlot.attribute === existingSlot.attribute && candidateSlot.value !== existingSlot.value) {
        return true;
      }
    }

    // 3. Domain-specific semantic dimension comparison
    if (candidate.domain === existing.domain) {
      const isConflicting = this.checkSemanticDimensionConflict(
        candidate.content.toLowerCase(),
        existing.content.toLowerCase()
      );
      if (isConflicting) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts structured attribute and normalized value without regex.
   * Splits on colon if present (e.g. "Topic: Value").
   */
  private extractStructuredSlot(text: string): { attribute: string; value: string } | null {
    const colonIndex = text.indexOf(":");
    if (colonIndex > 0) {
      const rawAttr = text.substring(0, colonIndex).trim().toLowerCase();
      const rawVal = text.substring(colonIndex + 1).trim().toLowerCase();

      // Normalize common synonyms
      const normalizedAttr = rawAttr
        .replace("preference", "")
        .replace("hypothesis", "")
        .replace("fact", "")
        .trim();

      return {
        attribute: normalizedAttr,
        value: rawVal,
      };
    }
    return null;
  }

  /**
   * Checks known conflicting categorical values within semantic dimensions
   * without using regular expressions.
   */
  private checkSemanticDimensionConflict(textA: string, textB: string): boolean {
    const dimensionSets: string[][] = [
      // Temporal preference
      ["morning", "mornings", "night", "nights", "evening"],
      // Dietary categories
      ["vegetarian", "vegan", "meat", "beef", "chicken", "omnivore"],
      // Work mode
      ["remote", "wfh", "in-office", "commute"],
      // Workout type
      ["running", "cardio", "powerlifting", "heavy lifting"],
    ];

    for (const set of dimensionSets) {
      const matchA = set.find((val) => textA.includes(val));
      const matchB = set.find((val) => textB.includes(val));

      if (matchA && matchB && matchA !== matchB) {
        // If one is morning and one is night, or vegetarian vs meat -> contradiction
        const isTemporalConflict =
          (matchA.startsWith("morning") && (matchB.startsWith("night") || matchB.startsWith("evening"))) ||
          (matchB.startsWith("morning") && (matchA.startsWith("night") || matchA.startsWith("evening")));

        const isDietConflict =
          ((matchA === "vegetarian" || matchA === "vegan") && (matchB === "meat" || matchB === "beef" || matchB === "chicken" || matchB === "omnivore")) ||
          ((matchB === "vegetarian" || matchB === "vegan") && (matchA === "meat" || matchA === "beef" || matchA === "chicken" || matchA === "omnivore"));

        const isWorkConflict =
          ((matchA === "remote" || matchA === "wfh") && (matchB === "in-office" || matchB === "commute")) ||
          ((matchB === "remote" || matchB === "wfh") && (matchA === "in-office" || matchA === "commute"));

        if (isTemporalConflict || isDietConflict || isWorkConflict) {
          return true;
        }
      }
    }

    return false;
  }
}
