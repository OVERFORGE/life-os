import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { QueryDailyLogsRangePayload } from "../orchestration/contracts/ActionPayloadSchemas";
import {
  assertReadDbReady,
  buildUserIdMatcher,
  calculateInclusiveDayCount,
  clampPagination,
  redactInternalFields,
  STAGE1_READ_QUERY_TIMEOUT_MS,
} from "./readQueryUtils";

export const MAX_DAILY_LOG_QUERY_DAYS = 90;

const DEFAULT_DAILY_LOG_SECTIONS = [
  "mental",
  "sleep",
  "physical",
  "work",
  "habits",
  "planning",
  "signals",
] as const;

export interface DailyLogsRangeQueryResult {
  items: Record<string, any>[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  coverage: {
    requestedDays: number;
    loggedDays: number;
    coverageRatio: number;
    startDate: string;
    endDate: string;
    reflectionIncluded: boolean;
  };
  emptyReason: string;
}

export interface DailyLogData {
  _id?: string;
  userId: string;
  date: string;
  mental?: {
    mood?: number;
    energy?: number;
    stress?: number;
    anxiety?: number;
    focus?: number;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    sleepTime?: string;
    wakeTime?: string;
  };
  work?: {
    deepWorkHours?: number;
    coded?: boolean;
    executioners?: boolean;
    studied?: boolean;
    mainWork?: string;
  };
  habits?: Record<string, boolean>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class DailyLogRepository {
  private static instance: DailyLogRepository;

  static getInstance(): DailyLogRepository {
    if (!DailyLogRepository.instance) {
      DailyLogRepository.instance = new DailyLogRepository();
    }
    return DailyLogRepository.instance;
  }

  /**
   * Fetches daily logs for a given user within a target number of days.
   * Returns records sorted by date ascending.
   */
  async findLogsForWindow(userId: string, days: number = 14): Promise<DailyLogData[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0];

      const docs = await DailyLog.find({
        userId,
        date: { $gte: startDateStr },
      })
        .sort({ date: 1 })
        .lean();

      return docs as unknown as DailyLogData[];
    } catch (error) {
      console.warn("[DailyLogRepository] Database query failed or un-connected, returning empty set.", error);
      return [];
    }
  }

  /**
   * Fetches latest single daily log entry.
   */
  async findLatestLog(userId: string): Promise<DailyLogData | null> {
    try {
      const doc = await DailyLog.findOne({ userId }).sort({ date: -1 }).lean();
      return (doc as unknown as DailyLogData) || null;
    } catch (error) {
      console.warn("[DailyLogRepository] findLatestLog query failed.", error);
      return null;
    }
  }

  /**
   * Stage 1 bounded, tenant-scoped daily log range query (<= 90 inclusive days).
   * Excludes `reflection` by default unless explicitly opted in.
   */
  async queryRange(
    userId: string,
    filter: QueryDailyLogsRangePayload
  ): Promise<DailyLogsRangeQueryResult> {
    assertReadDbReady("lifeos.daily_logs.query_range");

    const dayCount = calculateInclusiveDayCount(filter.startDate, filter.endDate);
    if (dayCount > MAX_DAILY_LOG_QUERY_DAYS) {
      throw new Error(
        `[DATE_RANGE_EXCEEDED]: Daily logs query range (${dayCount} days) exceeds maximum ${MAX_DAILY_LOG_QUERY_DAYS} days.`
      );
    }

    const userMatcher = buildUserIdMatcher(userId, "OBJECT_ID");
    const mongoFilter = {
      userId: userMatcher,
      date: { $gte: filter.startDate, $lte: filter.endDate },
    };

    const requestedSections =
      Array.isArray(filter.sections) && filter.sections.length > 0
        ? filter.sections
        : [...DEFAULT_DAILY_LOG_SECTIONS];

    // Reflection is excluded by default; explicit opt-in required (includeReflection === true)
    const reflectionExplicitlyAllowed =
      filter.includeReflection === true ||
      (filter.includeReflection !== false &&
        Array.isArray(filter.sections) &&
        filter.sections.includes("reflection"));

    const projection: Record<string, number> = {
      _id: 1,
      userId: 1,
      date: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    for (const sec of requestedSections) {
      if (sec === "reflection") {
        if (reflectionExplicitlyAllowed) {
          projection.reflection = 1;
        }
      } else {
        projection[sec] = 1;
      }
    }
    if (filter.includeReflection === true) {
      projection.reflection = 1;
    }

    const { limit, offset } = clampPagination(filter.limit, filter.offset, 30, 90, 1000);

    const [totalCount, docs] = await Promise.all([
      DailyLog.countDocuments(mongoFilter).maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS),
      DailyLog.find(mongoFilter)
        .select(projection)
        .sort({ date: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec(),
    ]);

    const items = (docs as Record<string, any>[]).map((d) => {
      const sanitized = redactInternalFields(d);
      if (!reflectionExplicitlyAllowed) {
        delete sanitized.reflection;
      }
      return sanitized;
    });

    const returnedCount = items.length;
    const hasMore = offset + returnedCount < totalCount;
    const coverageRatio = dayCount > 0 ? Number((totalCount / dayCount).toFixed(4)) : 0;
    const emptyReason =
      totalCount === 0
        ? "NO_DAILY_LOGS_IN_RANGE"
        : returnedCount === 0
          ? "OFFSET_BEYOND_RESULTS"
          : "NONE";

    return {
      items,
      totalCount,
      returnedCount,
      hasMore,
      coverage: {
        requestedDays: dayCount,
        loggedDays: totalCount,
        coverageRatio,
        startDate: filter.startDate,
        endDate: filter.endDate,
        reflectionIncluded: reflectionExplicitlyAllowed,
      },
      emptyReason,
    };
  }
}
