/**
 * SeededRNG — Pure Deterministic Pseudo-Random Number Generator
 *
 * Implements the Mulberry32 algorithm.
 * 100% deterministic, seed-driven, zero calls to Math.random().
 * Independent instances guarantee exact replayability.
 */

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    // Force 32-bit unsigned integer seed
    this.state = seed >>> 0;
  }

  /**
   * Generates a deterministic floating-point number in range [0, 1).
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic integer in range [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    const range = Math.floor(max) - Math.floor(min) + 1;
    return Math.floor(min + this.next() * range);
  }

  /**
   * Returns true with a given probability (0.0 to 1.0).
   */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Fork a child RNG deterministically derived from the current RNG state + salt.
   */
  public fork(salt: number = 0): SeededRNG {
    const childSeed = Math.floor(this.next() * 0x7fffffff) + salt;
    return new SeededRNG(childSeed);
  }
}
