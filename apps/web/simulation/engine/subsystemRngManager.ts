/**
 * SubsystemRNGManager — Stream-Isolated Deterministic PRNG Manager
 *
 * Derives independent, isolated PRNG streams from a master simulation seed.
 * Ensures randomness in one subsystem (e.g. notifications) never affects
 * the replay output of another subsystem (e.g. biometrics or task progress).
 */

import { SeededRNG } from "./seededRng";

export class SubsystemRNGManager {
  public readonly energyRng: SeededRNG;
  public readonly taskRng: SeededRNG;
  public readonly environmentRng: SeededRNG;
  public readonly notificationRng: SeededRNG;
  public readonly relationshipRng: SeededRNG;

  constructor(masterSeed: number) {
    const master = new SeededRNG(masterSeed);
    // Fork independent streams with fixed salt offsets
    this.energyRng = master.fork(1001);
    this.taskRng = master.fork(2002);
    this.environmentRng = master.fork(3003);
    this.notificationRng = master.fork(4004);
    this.relationshipRng = master.fork(5005);
  }

  /**
   * Derive a fresh PRNG for a specific tick step if needed.
   */
  public forTick(tick: number): SubsystemRNGManager {
    return new SubsystemRNGManager(this.energyRng.nextInt(1, 1000000) + tick);
  }
}
