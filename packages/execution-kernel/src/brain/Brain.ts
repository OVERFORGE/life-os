import { KnowledgeSystem } from "./knowledge/KnowledgeSystem";
import { UserStateSystem } from "./state/UserState";
import { MemorySystem } from "./memory/Memory";
import { WorldModel } from "../world/WorldModel";

/**
 * Brain System Controller (Central Cognitive Facade)
 * 
 * ARCHITECTURAL RULE:
 * The Brain is the single unified facade representing what the system currently believes about the user's world.
 * Subsystems (Reasoner, Planner, Scheduler) query through the Brain facade, which exposes Knowledge, State,
 * Memory, and the read-only WorldModel.
 */
export class Brain {
  private static instance: Brain;

  readonly knowledge: KnowledgeSystem;
  readonly state: UserStateSystem;
  readonly memory: MemorySystem;
  readonly world: WorldModel;

  private constructor() {
    this.knowledge = new KnowledgeSystem();
    this.state = new UserStateSystem();
    this.memory = new MemorySystem();
    this.world = new WorldModel(this.knowledge, this.state, this.memory);
  }

  static getInstance(): Brain {
    if (!Brain.instance) {
      Brain.instance = new Brain();
    }
    return Brain.instance;
  }

  /**
   * Resets Working Memory at the start/end of an execution cycle.
   */
  resetWorkingMemory(): void {
    this.memory.clearCategory("Working");
  }
}
