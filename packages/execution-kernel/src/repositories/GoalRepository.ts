import { Goal } from "@/features/goals/models/Goal";

export interface GoalData {
  _id?: string;
  userId: string;
  title: string;
  category?: string;
  targetDate?: string;
  status: "active" | "completed" | "archived" | string;
  progress?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class GoalRepository {
  private static instance: GoalRepository;

  static getInstance(): GoalRepository {
    if (!GoalRepository.instance) {
      GoalRepository.instance = new GoalRepository();
    }
    return GoalRepository.instance;
  }

  async findAllActiveGoals(userId: string): Promise<GoalData[]> {
    try {
      const docs = await Goal.find({ userId }).lean();
      return docs as unknown as GoalData[];
    } catch (error) {
      console.warn("[GoalRepository] Query failed, returning fallback empty set.", error);
      return [];
    }
  }
}
