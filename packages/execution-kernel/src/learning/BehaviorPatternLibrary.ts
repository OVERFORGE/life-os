import { BehaviorPattern, PatternType } from "./BehaviorPattern";

/**
 * BehaviorPatternLibrary Subsystem
 * 
 * SOLE OWNER of storing, indexing, and querying active behavior patterns.
 */
export class BehaviorPatternLibrary {
  private static instance: BehaviorPatternLibrary;
  private patterns: Map<string, BehaviorPattern> = new Map();
  private typeIndex: Map<PatternType, BehaviorPattern[]> = new Map();

  static getInstance(): BehaviorPatternLibrary {
    if (!BehaviorPatternLibrary.instance) {
      BehaviorPatternLibrary.instance = new BehaviorPatternLibrary();
    }
    return BehaviorPatternLibrary.instance;
  }

  savePattern(pattern: BehaviorPattern): void {
    this.patterns.set(pattern.patternId, { ...pattern });
    this.rebuildIndex();
  }

  getPattern(patternId: string): BehaviorPattern | undefined {
    const p = this.patterns.get(patternId);
    return p ? { ...p } : undefined;
  }

  getPatternsByType(type: PatternType): BehaviorPattern[] {
    return (this.typeIndex.get(type) || []).map((p) => ({ ...p }));
  }

  getAllPatterns(): BehaviorPattern[] {
    return Array.from(this.patterns.values()).map((p) => ({ ...p }));
  }

  private rebuildIndex(): void {
    this.typeIndex.clear();
    for (const pattern of this.patterns.values()) {
      if (!this.typeIndex.has(pattern.type)) {
        this.typeIndex.set(pattern.type, []);
      }
      this.typeIndex.get(pattern.type)!.push(pattern);
    }
  }
}
