import { KnowledgeSystem } from "../brain/knowledge/KnowledgeSystem";
import { Entity } from "../brain/knowledge/Entity";
import { UserStateSystem } from "../brain/state/UserState";
import { MemorySystem } from "../brain/memory/Memory";
import { WorldSnapshot, createWorldSnapshot } from "./WorldSnapshot";
import { PredictionEngine } from "../prediction/PredictionEngine";
import { InsightEngine } from "../insights/InsightEngine";
import { ProactiveEngine } from "../proactive/ProactiveEngine";

/**
 * World Model Subsystem
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * The World Model is a lazy read model. Calling `getSnapshot()` dynamically constructs
 * and returns a fresh, immutable point-in-time snapshot of reality directly from Knowledge, State, and Memory,
 * enriched sequentially by PredictionEngine, InsightEngine, and ProactiveEngine.
 */
export class WorldModel {
  constructor(
    private knowledge: KnowledgeSystem,
    private state: UserStateSystem,
    private memory: MemorySystem
  ) {}

  /**
   * Constructs a fresh, immutable snapshot of the user's current world.
   * Pipeline order: Reality -> Predictions -> Insights -> Proactive Suggestions -> Final Snapshot.
   */
  getSnapshot(activeContext: Record<string, any> = {}): WorldSnapshot {
    const userState = this.state.getAllState();
    const recentMemories = [
      ...this.memory.getByCategory("Working"),
      ...this.memory.getByCategory("Episodic"),
    ];
    
    const activeEntities: Entity[] = this.knowledge.getAllEntities();

    // 1. Construct base reality snapshot
    const baseSnapshot = createWorldSnapshot(activeEntities, userState, recentMemories, [], [], [], activeContext);

    // 2. Evaluate near-future predictions
    const predictions = PredictionEngine.getInstance().predict(baseSnapshot);
    const snapshotWithPreds: WorldSnapshot = { ...baseSnapshot, predictions };

    // 3. Evaluate recurring historical insights
    const insights = InsightEngine.getInstance().generateInsights(snapshotWithPreds);
    const snapshotWithInsights: WorldSnapshot = { ...snapshotWithPreds, insights };

    // 4. Evaluate passive proactive suggestions
    const suggestions = ProactiveEngine.getInstance().evaluate(snapshotWithInsights);

    return {
      ...snapshotWithInsights,
      suggestions,
    };
  }
}
