import { Goal } from "../../../../apps/web/features/goals/models/Goal";
import { GoalStatsModel } from "../../../../apps/web/server/db/models/GoalStatsModel";
import { QueryGoalsPayload } from "../orchestration/contracts/ActionPayloadSchemas";
import {
  assertReadDbReady,
  buildUserIdMatcher,
  clampPagination,
  escapeSearchRegex,
  redactInternalFields,
  STAGE1_READ_QUERY_TIMEOUT_MS,
} from "./readQueryUtils";

export interface GoalQueryResult {
  items: Record<string, any>[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  emptyReason: string;
}

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

  /**
   * Stage 1 bounded, tenant-scoped goal query with optional GoalStats join.
   */
  async queryGoals(userId: string, filter: QueryGoalsPayload = {}): Promise<GoalQueryResult> {
    assertReadDbReady("lifeos.goals.query");

    const userMatcher = buildUserIdMatcher(userId, "MIXED");
    const mongoFilter: Record<string, any> = { userId: userMatcher };

    if (filter.status && filter.status !== "all") {
      mongoFilter.status = filter.status;
    }
    if (filter.nature) {
      mongoFilter.nature = filter.nature;
    }
    if (filter.cadence) {
      mongoFilter.cadence = filter.cadence;
    }
    if (filter.search && filter.search.trim().length > 0) {
      const regex = new RegExp(escapeSearchRegex(filter.search.trim()), "i");
      mongoFilter.$or = [{ title: regex }, { description: regex }];
    }

    const { limit, offset } = clampPagination(filter.limit, filter.offset, 50, 100, 1000);
    const includeMilestones = filter.includeMilestones !== false;
    const includeStats = filter.includeStats !== false;

    const projection: Record<string, number> = {
      _id: 1,
      userId: 1,
      title: 1,
      description: 1,
      status: 1,
      nature: 1,
      horizon: 1,
      definitionOfDone: 1,
      targetCompletionDate: 1,
      deliverableProgressPercent: 1,
      type: 1,
      cadence: 1,
      signals: 1,
      rules: 1,
      confirmedAt: 1,
      archivedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    if (includeMilestones) {
      projection.milestones = 1;
    }

    const [totalCount, docs] = await Promise.all([
      Goal.countDocuments(mongoFilter).maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS),
      Goal.find(mongoFilter)
        .select(projection)
        .sort({ updatedAt: -1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec(),
    ]);

    let statsByGoalId = new Map<string, Record<string, any>>();
    if (includeStats && docs.length > 0) {
      const goalIds = (docs as Record<string, any>[]).map((d) => String(d._id));
      const statsDocs = await GoalStatsModel.find({
        userId: String(userId),
        goalId: { $in: goalIds },
      })
        .select({
          _id: 0,
          goalId: 1,
          nature: 1,
          currentScore: 1,
          deliverableProgressPercent: 1,
          completedMilestonesCount: 1,
          totalMilestonesCount: 1,
          completedTasksCount: 1,
          totalTasksCount: 1,
          state: 1,
          momentum: 1,
          bestScoreEver: 1,
          bestStreakEver: 1,
          currentStreak: 1,
          daysSinceProgress: 1,
          lastEvaluatedAt: 1,
        })
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec();

      for (const s of statsDocs as Record<string, any>[]) {
        statsByGoalId.set(String(s.goalId), s);
      }
    }

    const items = (docs as Record<string, any>[]).map((d) => {
      const sanitized = redactInternalFields(d);
      if (includeStats) {
        sanitized.stats = statsByGoalId.get(sanitized._id) || null;
      }
      return sanitized;
    });

    const returnedCount = items.length;
    const hasMore = offset + returnedCount < totalCount;
    const emptyReason =
      totalCount === 0
        ? "NO_MATCHING_GOALS"
        : returnedCount === 0
          ? "OFFSET_BEYOND_RESULTS"
          : "NONE";

    return {
      items,
      totalCount,
      returnedCount,
      hasMore,
      emptyReason,
    };
  }
}
