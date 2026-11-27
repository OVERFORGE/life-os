import { TemporalOccurrence } from "../../../../apps/web/server/db/models/TemporalOccurrence";
import { ExecutionChronicle } from "../../../../apps/web/server/db/models/ExecutionChronicle";
import { QueryScheduleOccurrencesPayload } from "../orchestration/contracts/ActionPayloadSchemas";
import { PreferenceResolutionHelper } from "../worldv2/PreferenceResolutionHelper";
import {
  assertReadDbReady,
  buildUserIdMatcher,
  calculateInclusiveDayCount,
  clampPagination,
  redactInternalFields,
  STAGE1_READ_QUERY_TIMEOUT_MS,
} from "./readQueryUtils";

export const MAX_SCHEDULE_QUERY_DAYS = 31;

export interface ScheduleOccurrencesQueryResult {
  items: Record<string, any>[];
  chronicleItems?: Record<string, any>[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  resolvedTimezone: string;
  isTimezoneFallback: boolean;
  emptyReason: string;
}

export class ScheduleQueryRepository {
  private static instance: ScheduleQueryRepository;

  static getInstance(): ScheduleQueryRepository {
    if (!ScheduleQueryRepository.instance) {
      ScheduleQueryRepository.instance = new ScheduleQueryRepository();
    }
    return ScheduleQueryRepository.instance;
  }

  /**
   * Stage 1 bounded, tenant-scoped schedule occurrence query (<= 31 inclusive days).
   */
  async queryOccurrences(
    userId: string,
    filter: QueryScheduleOccurrencesPayload
  ): Promise<ScheduleOccurrencesQueryResult> {
    assertReadDbReady("lifeos.schedule.query_occurrences");

    const dayCount = calculateInclusiveDayCount(filter.startDate, filter.endDate);
    if (dayCount > MAX_SCHEDULE_QUERY_DAYS) {
      throw new Error(
        `[DATE_RANGE_EXCEEDED]: Schedule occurrence query range (${dayCount} days) exceeds maximum ${MAX_SCHEDULE_QUERY_DAYS} days.`
      );
    }

    const userMatcher = buildUserIdMatcher(userId, "STRING");
    const tzResolution = await PreferenceResolutionHelper.resolveUserTimezone(
      String(userId),
      filter.timezone
    );

    const mongoFilter: Record<string, any> = {
      userId: userMatcher,
      dateOnly: { $gte: filter.startDate, $lte: filter.endDate },
    };

    if (filter.status && filter.status !== "all") {
      mongoFilter.status = filter.status;
    }
    if (filter.kind) {
      mongoFilter.kind = filter.kind;
    }

    const { limit, offset } = clampPagination(filter.limit, filter.offset, 50, 200, 2000);

    const [totalCount, docs] = await Promise.all([
      TemporalOccurrence.countDocuments(mongoFilter).maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS),
      TemporalOccurrence.find(mongoFilter)
        .select({
          _id: 1,
          occurrenceId: 1,
          userId: 1,
          seriesId: 1,
          title: 1,
          kind: 1,
          dateOnly: 1,
          plannedInterval: 1,
          locationContext: 1,
          rigidity: 1,
          status: 1,
          linkedEntity: 1,
          overrideType: 1,
          metadata: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ dateOnly: 1, "plannedInterval.startMinute": 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec(),
    ]);

    const items = (docs as Record<string, any>[]).map((d) => redactInternalFields(d));

    let chronicleItems: Record<string, any>[] | undefined;
    if (filter.includeExecutionChronicle === true) {
      const [sy, sm, sd] = filter.startDate.split("-").map((n) => parseInt(n, 10));
      const [ey, em, ed] = filter.endDate.split("-").map((n) => parseInt(n, 10));
      const startMs = Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0);
      const endMs = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999);

      const chronicleDocs = await ExecutionChronicle.find({
        userId: userMatcher,
        startedAtMs: { $gte: startMs, $lte: endMs },
      })
        .select({
          _id: 1,
          chronicleId: 1,
          userId: 1,
          occurrenceId: 1,
          entityType: 1,
          entityId: 1,
          title: 1,
          startedAtMs: 1,
          endedAtMs: 1,
          durationMinutes: 1,
          interruptionsCount: 1,
          completedWorkUnits: 1,
          source: 1,
          createdAt: 1,
        })
        .sort({ startedAtMs: 1, _id: 1 })
        .limit(200)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec();

      chronicleItems = (chronicleDocs as Record<string, any>[]).map((d) => redactInternalFields(d));
    }

    const returnedCount = items.length;
    const hasMore = offset + returnedCount < totalCount;
    const emptyReason =
      totalCount === 0
        ? "NO_OCCURRENCES_IN_RANGE"
        : returnedCount === 0
          ? "OFFSET_BEYOND_RESULTS"
          : "NONE";

    return {
      items,
      ...(chronicleItems !== undefined ? { chronicleItems } : {}),
      totalCount,
      returnedCount,
      hasMore,
      resolvedTimezone: tzResolution.timezone,
      isTimezoneFallback: tzResolution.isFallback,
      emptyReason,
    };
  }
}
