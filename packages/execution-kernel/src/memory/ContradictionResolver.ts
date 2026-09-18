import {
  PersonalMemoryRecord,
  EpistemicSource,
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

/**
 * ContradictionResolver
 * 
 * Analyzes candidate memories against existing memories to detect:
 * 1. Agreement / Duplicate -> Reinforces existing memory, increments evidence count.
 * 2. Contradiction with older memory -> If candidate is explicit, supersedes older memory (sets validTo).
 * 3. Contradiction from inference -> Rejects candidate if it tries to overwrite explicit fact.
 * 4. Novel information -> Stores as new memory.
 * 
 * Enforces Invariant 2 (repeated evidence strengthens), Invariant 3 (contradictory statements update temporal validity),
 * and Invariant 9 (inference cannot silently overturn explicit fact).
 */
export class ContradictionResolver {
  private static instance: ContradictionResolver;

  // Semantic antonym / polarity pairs that signal contradiction when applied to same subject
  private static readonly POLARITY_PAIRS: Array<[RegExp, RegExp]> = [
    [/\b(morning|mornings|am|early)\b/i, /\b(night|nights|pm|evening|late)\b/i],
    [/\b(prefer|like|love|enjoy)\b/i, /\b(hate|dislike|avoid|refuse|can't stand)\b/i],
    [/\b(vegetarian|vegan|plant-based)\b/i, /\b(meat|beef|chicken|pork|omnivore)\b/i],
    [/\b(running|cardio|endurance)\b/i, /\b(powerlifting|heavy lifting|weights only)\b/i],
    [/\b(remote|work from home|wfh)\b/i, /\b(in-office|office full-time|commute)\b/i],
  ];

  static getInstance(): ContradictionResolver {
    if (!ContradictionResolver.instance) {
      ContradictionResolver.instance = new ContradictionResolver();
    }
    return ContradictionResolver.instance;
  }

  /**
   * Evaluates candidate memory against top vector/semantic matches from the user's active memories.
   */
  resolve(
    candidate: CandidateMemory,
    existingMatches: Array<{ memory: PersonalMemoryRecord; score: number }>
  ): ContradictionResolution {
    if (!existingMatches || existingMatches.length === 0) {
      return {
        action: "NEW",
        reason: "No semantically related existing memories found.",
      };
    }

    const candidateText = candidate.content.toLowerCase();

    // Check against each relevant existing match
    for (const match of existingMatches) {
      const existing = match.memory;
      const existingText = existing.content.toLowerCase();
      const similarity = match.score;

      // Skip already archived or expired memories
      if (existing.isArchived || (existing.validTo && existing.validTo <= Date.now())) {
        continue;
      }

      // 1. Check for Contradiction
      const isContradiction = this.detectContradiction(candidateText, existingText);

      if (isContradiction) {
        // Case A: Candidate is explicit user statement
        if (candidate.source === "explicit_user_statement") {
          return {
            action: "SUPERSEDED",
            targetMemoryId: existing.id,
            supersededMemoryIds: [existing.id],
            reason: `Explicit user statement supersedes older memory (${existing.id}): "${existing.content}"`,
          };
        }

        // Case B: Candidate is system inference or telemetry trying to contradict an explicit fact
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

      // 2. Check for Duplicate / Reinforcement (High similarity, same polarity/meaning)
      const duplicateThreshold = DEFAULT_MEMORY_POLICY.duplicateSimilarityThreshold;
      const isDuplicateText = candidateText === existingText || similarity >= duplicateThreshold;

      if (isDuplicateText) {
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
   * Deterministic semantic contradiction check.
   */
  private detectContradiction(textA: string, textB: string): boolean {
    // Check polarity pairs (e.g. morning vs night, like vs hate)
    for (const [patternA, patternB] of ContradictionResolver.POLARITY_PAIRS) {
      const matchA1 = patternA.test(textA);
      const matchB2 = patternB.test(textB);
      const matchA2 = patternB.test(textA);
      const matchB1 = patternA.test(textB);

      if ((matchA1 && matchB2) || (matchA2 && matchB1)) {
        return true;
      }
    }

    // Check explicit negation phrase: "not true anymore", "actually", "stopped", "no longer"
    const negationPatterns = [
      /\b(not true anymore|actually|stopped|no longer|no more|quit|switched to)\b/i,
    ];
    for (const pat of negationPatterns) {
      if (pat.test(textA) && this.haveSubstantiveOverlap(textA, textB)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if two texts share substantive keywords (excluding common stop words).
   */
  private haveSubstantiveOverlap(textA: string, textB: string): boolean {
    const stopWords = new Set(["i", "the", "a", "an", "and", "or", "to", "in", "at", "my", "me", "now", "it", "is"]);
    const wordsA = new Set(textA.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w)));
    const wordsB = textB.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w));
    
    let shared = 0;
    for (const w of wordsB) {
      if (wordsA.has(w)) shared++;
    }
    return shared >= 2;
  }
}
