import {
  PersonalMemoryRecord,
  EpistemicSource,
  MemoryType,
  MemoryDomain,
} from "./PersonalMemoryContracts";

export interface CandidateMemory {
  userId: string;
  content: string;
  summary: string;
  source: EpistemicSource;
  domain: MemoryDomain;
  memoryType: MemoryType;
  relatedEntityIds?: string[];
  provenance?: Record<string, any>;
  isTransient?: boolean;
}

export interface VerificationAssessment {
  shouldStore: boolean;
  confidence: number;
  importance: number;
  rejectionReason?: string;
  isTransient: boolean;
}

/**
 * EpistemicVerificationEngine
 * 
 * SOLE OWNER of verifying epistemic validity and importance of candidate memories.
 * Prevents LLM hallucinations, transient noise, and unverified inferences
 * from polluting permanent user memory.
 *
 * Invariant: Operates through structured provenance, memory domain, and epistemic
 * source evaluation without static English regex patterns or arbitrary boosts.
 */
export class EpistemicVerificationEngine {
  private static instance: EpistemicVerificationEngine;

  static getInstance(): EpistemicVerificationEngine {
    if (!EpistemicVerificationEngine.instance) {
      EpistemicVerificationEngine.instance = new EpistemicVerificationEngine();
    }
    return EpistemicVerificationEngine.instance;
  }

  verifyCandidate(candidate: CandidateMemory): VerificationAssessment {
    return this.assess(candidate);
  }

  /**
   * Evaluates a candidate memory and produces an authoritative verification assessment.
   */
  assess(candidate: CandidateMemory): VerificationAssessment {
    const text = (candidate.content || candidate.summary || "").trim();

    // 1. Basic sanity: empty content cannot be stored
    if (!text || text.length < 5) {
      return {
        shouldStore: false,
        confidence: 0.0,
        importance: 0.0,
        rejectionReason: "Content too brief or empty",
        isTransient: true,
      };
    }

    // 2. Structured transience check
    if (candidate.isTransient === true) {
      return {
        shouldStore: false,
        confidence: 0.4,
        importance: 0.2,
        rejectionReason: "Explicitly marked as transient observation",
        isTransient: true,
      };
    }

    // 3. Epistemic scoring grounded in source and domain
    let confidence = 0.50;
    let importance = 0.40;

    switch (candidate.source) {
      case "explicit_user_statement":
        // Direct factual claim by user: highest epistemic trust
        confidence = 0.95;
        importance = candidate.domain === "identity" || candidate.domain === "health" ? 0.90 : 0.75;
        break;

      case "user_reflection":
        // Self-reported reflection in daily log or review
        confidence = 0.85;
        importance = 0.70;
        break;

      case "behavioral_telemetry":
        // Empirically derived from recurring actions/telemetry
        confidence = 0.80;
        importance = candidate.memoryType === "behavioral_pattern" ? 0.75 : 0.65;
        break;

      case "system_inference":
        // LLM hypothesis or provisional conclusion (cannot be accepted as hard truth without corroboration)
        confidence = 0.50;
        importance = 0.35;
        break;

      default:
        confidence = 0.50;
        importance = 0.40;
    }

    // Boost importance for domain-specific enduring concepts
    if (candidate.domain === "identity" || candidate.domain === "health") {
      importance = Math.min(1.0, importance + 0.10);
    }
    if (candidate.memoryType === "goal_intelligence") {
      importance = Math.min(1.0, importance + 0.10);
    }

    // 4. Storage gate: user statements and confirmed telemetry are preserved; uncorroborated inferences require high confidence
    const shouldStore =
      candidate.source === "explicit_user_statement" ||
      candidate.source === "user_reflection" ||
      (confidence >= 0.70 && importance >= 0.50);

    return {
      shouldStore,
      confidence: Number(confidence.toFixed(2)),
      importance: Number(importance.toFixed(2)),
      isTransient: false,
      rejectionReason: shouldStore ? undefined : "Uncorroborated inference below storage threshold",
    };
  }
}
