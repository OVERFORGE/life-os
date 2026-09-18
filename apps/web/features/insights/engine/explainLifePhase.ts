/**
 * DEPRECATED — Phase 16 Governance Rule Notice
 * 
 * Life Phase calculations are owned exclusively by LifeStateEngine in Kernel V1.
 * Frontend components consume DTO properties from useWorld().lifeState directly.
 */

export type PhaseExplanation = {
  summary: string;
  signals: string[];
  causes: string[];
  risks: string[];
  leverage: string[];
  predictedNext: string | null;
  scores: {
    stress: number;
    energy: number;
    mood: number;
    sleep: number;
    stability: number;
    load: number;
  };
};

export function explainLifePhase(...args: any[]): PhaseExplanation {
  return {
    summary: "Managed by LifeOS Kernel V1 LifeStateEngine",
    signals: [],
    causes: [],
    risks: [],
    leverage: [],
    predictedNext: null,
    scores: { stress: 0, energy: 0, mood: 0, sleep: 0, stability: 1, load: 0 },
  };
}

export default explainLifePhase;
