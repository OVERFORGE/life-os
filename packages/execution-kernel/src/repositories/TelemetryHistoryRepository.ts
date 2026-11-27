import { CognitiveStateHistoryModel } from "../server/db/models/CognitiveStateHistoryModel";
import { ObservationPipeline } from "../telemetry/pipeline/ObservationPipeline";
import { ObservationType } from "../telemetry/Observation";
import { QueryTelemetryStateHistoryPayload } from "../orchestration/contracts/ActionPayloadSchemas";
import {
  assertReadDbReady,
  buildUserIdMatcher,
  calculateInclusiveDayCount,
  clampPagination,
  redactInternalFields,
  STAGE1_READ_QUERY_TIMEOUT_MS,
  validateCalendarDate,
} from "./readQueryUtils";

export const MAX_TELEMETRY_QUERY_DAYS = 30;

export type TelemetryAvailabilityStatus = "AVAILABLE" | "PARTIAL" | "EMPTY_SOURCE";

export interface TelemetryStateHistoryQueryResult {
  items: Record<string, any>[];
  observations?: Record<string, any>[];
  totalCount: number;
  returnedCount: number;
  hasMore: boolean;
  availabilityStatus: TelemetryAvailabilityStatus;
  emptyReason: string;
}

export class TelemetryHistoryRepository {
  private static instance: TelemetryHistoryRepository;

  static getInstance(): TelemetryHistoryRepository {
    if (!TelemetryHistoryRepository.instance) {
      TelemetryHistoryRepository.instance = new TelemetryHistoryRepository();
    }
    return TelemetryHistoryRepository.instance;
  }

  /**
   * Stage 1 bounded, tenant-scoped cognitive state history + observation query (<= 30 inclusive days).
   * Never fabricates synthetic telemetry when sources are empty.
   */
  async queryStateHistory(
    userId: string,
    filter: QueryTelemetryStateHistoryPayload = {}
  ): Promise<TelemetryStateHistoryQueryResult> {
    assertReadDbReady("lifeos.telemetry.query_state_history");

    let startDate = filter.startDate;
    let endDate = filter.endDate;

    if (!startDate && !endDate) {
      const now = new Date();
      endDate = now.toISOString().split("T")[0];
      const start = new Date(now.getTime() - 6 * 86_400_000);
      startDate = start.toISOString().split("T")[0];
    } else if (startDate && !endDate) {
      const check = validateCalendarDate(startDate);
      if (!check.valid) throw new Error(`[INVALID_DATE_RANGE]: ${check.reason}`);
      endDate = startDate;
    } else if (!startDate && endDate) {
      const check = validateCalendarDate(endDate);
      if (!check.valid) throw new Error(`[INVALID_DATE_RANGE]: ${check.reason}`);
      startDate = endDate;
    }

    const dayCount = calculateInclusiveDayCount(startDate!, endDate!);
    if (dayCount > MAX_TELEMETRY_QUERY_DAYS) {
      throw new Error(
        `[DATE_RANGE_EXCEEDED]: Telemetry query range (${dayCount} days) exceeds maximum ${MAX_TELEMETRY_QUERY_DAYS} days.`
      );
    }

    const [sy, sm, sd] = startDate!.split("-").map((n) => parseInt(n, 10));
    const [ey, em, ed] = endDate!.split("-").map((n) => parseInt(n, 10));
    const startMs = Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0);
    const endMs = Date.UTC(ey, em - 1, ed, 23, 59, 59, 999);

    const userMatcher = buildUserIdMatcher(userId, "STRING");
    const mongoFilter = {
      userId: userMatcher,
      timestamp: { $gte: startMs, $lte: endMs },
    };

    const { limit, offset } = clampPagination(filter.limit, filter.offset, 50, 100, 1000);

    const [totalCount, docs] = await Promise.all([
      CognitiveStateHistoryModel.countDocuments(mongoFilter).maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS),
      CognitiveStateHistoryModel.find(mongoFilter)
        .select({
          _id: 1,
          userId: 1,
          timestamp: 1,
          stress: 1,
          energy: 1,
          cognitiveLoad: 1,
          focusReadiness: 1,
          provenance: 1,
          temporalValidity: 1,
          disclaimer: 1,
          createdAt: 1,
        })
        .sort({ timestamp: -1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .maxTimeMS(STAGE1_READ_QUERY_TIMEOUT_MS)
        .lean()
        .exec(),
    ]);

    const items = (docs as Record<string, any>[]).map((d) => redactInternalFields(d));

    let observations: Record<string, any>[] | undefined;
    if (filter.includeObservations === true) {
      const rawObservations = await ObservationPipeline.getInstance().getObservationsForWindow(
        String(userId),
        startMs,
        endMs,
        filter.observationTypes as ObservationType[] | undefined,
        { limit: Math.min(limit, 100), maxTimeMS: 75 }
      );
      observations = rawObservations.map((obs) => ({
        id: obs.id,
        type: obs.type,
        timestamp: obs.timestamp,
        normalizedValue: obs.normalizedValue,
        rawValue: obs.rawValue,
        unit: obs.unit,
        confidence: obs.confidence,
        ownership: obs.ownership,
      }));
    }

    const returnedCount = items.length;
    const hasMore = offset + returnedCount < totalCount;
    const hasObs = Boolean(observations && observations.length > 0);

    let availabilityStatus: TelemetryAvailabilityStatus;
    if (items.length > 0 && (!filter.includeObservations || hasObs)) {
      availabilityStatus = "AVAILABLE";
    } else if (items.length > 0 || hasObs) {
      availabilityStatus = "PARTIAL";
    } else {
      availabilityStatus = "EMPTY_SOURCE";
    }

    const emptyReason =
      availabilityStatus === "EMPTY_SOURCE"
        ? "NO_TELEMETRY_RECORDS_IN_RANGE"
        : returnedCount === 0 && totalCount > 0
          ? "OFFSET_BEYOND_RESULTS"
          : "NONE";

    return {
      items,
      ...(observations !== undefined ? { observations } : {}),
      totalCount,
      returnedCount,
      hasMore,
      availabilityStatus,
      emptyReason,
    };
  }
}
