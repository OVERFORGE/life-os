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
 */
export class EpistemicVerificationEngine {
  private static instance: EpistemicVerificationEngine;

  // Transient conversational regexes that MUST NOT be permanently remembered (Invariant 1)
  private static readonly TRANSIENT_PATTERNS = [
    /\b(having|eating|drinking)\s+(coffee|tea|water|lunch|dinner|breakfast|snack)\s*(now|right now)?\b/i,
    /\b(just\s+(woke up|arrived|sat down|finished my coffee))\b/i,
    /\b(it('s|\s+is)\s+(raining|sunny|cloudy|cold|hot)\s+today)\b/i,
    /\b(feeling\s+(a\s+bit\s+)?(sleepy|hungry|bored)\s*(right now|today))\b/i,
    /\b(brb|gtg|hello|hi|hey|good\s+(morning|afternoon|evening))\b/i,
  ];

  // High importance enduring life patterns (Invariant 8 & 12)
  private static readonly HIGH_IMPORTANCE_PATTERNS = [
    /\b(diagnosed with|allergic to|allergy|injury|injured|chronic|asthma|diabetes)\b/i,
    /\b(prefer|routine|habit|schedule|work\s+hours|deep\s+work|wake\s+up\s+at|sleep\s+at)\b/i,
    /\b(goal|milestone|marathon|exam|degree|promoted|new\s+job|moved\s+to)\b/i,
    /\b(family|kids?|daughter|son|wife|husband|partner|parent)\b/i,
    /\b(never|always|do\s+not\s+like|hate|refuse|strictly)\b/i,
  ];

  static getInstance(): EpistemicVerificationEngine {
    if (!EpistemicVerificationEngine.instance) {
      EpistemicVerificationEngine.instance = new EpistemicVerificationEngine();
    }
    return EpistemicVerificationEngine.instance;
  }

  verifyCandidate(candidate: CandidateMemory): VerificationAssessment {
    const text = candidate.content.trim();

    // 1. Minimum content check
    if (text.length < 5) {
      return {
        shouldStore: false,
        confidence: 0,
        importance: 0,
        rejectionReason: "Content too brief to form memory",
        isTransient: true,
      };
    }

    // 2. Transient noise gate (Invariant 1)
    for (const pat of EpistemicVerificationEngine.TRANSIENT_PATTERNS) {
      if (pat.test(text)) {
        return {
          shouldStore: false,
          confidence: 0.3,
          importance: 0.1,
          rejectionReason: "Transient conversation detail rejected to prevent memory pollution",
          isTransient: true,
        };
      }
    }

    // 3. Epistemic Source Classification & Confidence Assignment
    let confidence = 0.70;
    let importance = 0.50;

    switch (candidate.source) {
      case "explicit_user_statement":
        // User directly stated this fact about themselves (highest trust)
        confidence = 0.95;
        importance = 0.75;
        break;

      case "user_reflection":
        // Self-reported reflection in daily log or review
        confidence = 0.85;
        importance = 0.70;
        break;

      case "behavioral_telemetry":
        // Empirically derived from recurring actions/telemetry
        confidence = 0.80;
        importance = 0.65;
        break;

      case "system_inference":
        // LLM hypothesis or provisional conclusion (cannot be accepted as hard truth)
        confidence = 0.50;
        importance = 0.40;
        break;

      default:
        confidence = 0.50;
        importance = 0.40;
    }

    // 4. Boost importance for enduring patterns
    for (const pat of EpistemicVerificationEngine.HIGH_IMPORTANCE_PATTERNS) {
      if (pat.test(text)) {
        importance = Math.min(1.0, importance + 0.25);
        break;
      }
    }

    // 5. Importance storage threshold (Default: 0.45)
    const shouldStore = importance >= 0.45 && confidence >= 0.50;

    return {
      shouldStore,
      confidence: Number(confidence.toFixed(2)),
      importance: Number(importance.toFixed(2)),
      isTransient: false,
      rejectionReason: shouldStore ? undefined : "Importance or confidence below storage threshold",
    };
  }
}
