import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";

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
}
