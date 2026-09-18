import { LearningEngine } from "../learning/LearningEngine";
import { BehaviorPatternLibrary } from "../learning/BehaviorPatternLibrary";
import { LearningDTO } from "./dto/LearningDTO";
import { LearningDTOMapper } from "./mappers/LearningDTOMapper";

export class LearningService {
  private static instance: LearningService;

  static getInstance(): LearningService {
    if (!LearningService.instance) {
      LearningService.instance = new LearningService();
    }
    return LearningService.instance;
  }

  getLearning(): LearningDTO {
    const learningOutput = LearningEngine.getInstance().processObservations([]);
    const patterns = BehaviorPatternLibrary.getInstance().getAllPatterns();

    return LearningDTOMapper.toLearningDTO(
      learningOutput.activeProfile,
      patterns,
      learningOutput.emittedSignals
    );
  }
}
