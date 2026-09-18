import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { LearningEngine } from "../learning/LearningEngine";
import { WorldDTO } from "./dto/WorldDTO";
import { WorldDTOMapper } from "./mappers/WorldDTOMapper";

export class WorldService {
  private static instance: WorldService;

  static getInstance(): WorldService {
    if (!WorldService.instance) {
      WorldService.instance = new WorldService();
    }
    return WorldService.instance;
  }

  async getWorld(userId: string): Promise<WorldDTO> {
    const graph = await ExecutionGraph.buildFromDatabase(userId);
    const graphSnapshot = graph.createSnapshot();
    const learningOutput = LearningEngine.getInstance().processObservations([]);

    const worldSnapshot = WorldModelV2.getInstance().computeSnapshot({
      graphSnapshot,
      profile: learningOutput.activeProfile,
      learningSignals: learningOutput.emittedSignals,
    });

    return WorldDTOMapper.toWorldDTO(worldSnapshot);
  }
}
