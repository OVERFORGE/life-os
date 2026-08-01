import { ConversationSemantics } from "./ConversationSemantics";
import { Task } from "@/server/db/models/Task";
import { GoalProposal } from "@/server/db/models/GoalProposal";
import { DailyLog } from "@/server/db/models/DailyLog";
import { NutritionLog } from "@/server/db/models/NutritionLog";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { Brain } from "../brain/Brain";

// ──────────────────────────────────────────────
// HRAG Types
// ──────────────────────────────────────────────

export type TimeWindow =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "all_time";

export interface HistoricalQuery {
  userId: string;
  timeWindow?: TimeWindow;
  entityTypes?: string[];
  keywords?: string[];
  moduleContext?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface HistoricalRecord {
  id: string;
  source: "task" | "goal" | "daily_log" | "nutrition" | "workout" | "memory";
  title: string;
  content: string;
  date: Date;
  score: number;
  rawPayload?: any;
}

export interface HistoricalSearchResult {
  query: HistoricalQuery;
  records: HistoricalRecord[];
  totalFound: number;
}

/** Interface for pluggable historical data providers */
export interface IHistoricalProvider {
  sourceName: HistoricalRecord["source"];
  retrieve(query: HistoricalQuery, dateRange: { start: Date; end: Date }): Promise<HistoricalRecord[]>;
}

// ──────────────────────────────────────────────
// Time Window Utilities
// ──────────────────────────────────────────────

export function resolveDateRange(window?: TimeWindow): { start: Date; end: Date } {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  switch (window) {
    case "today":
      return { start: startOfDay, end: endOfDay };

    case "yesterday": {
      const start = new Date(startOfDay);
      start.setUTCDate(start.getUTCDate() - 1);
      const end = new Date(endOfDay);
      end.setUTCDate(end.getUTCDate() - 1);
      return { start, end };
    }

    case "this_week": {
      const start = new Date(startOfDay);
      start.setUTCDate(start.getUTCDate() - 7);
      return { start, end: endOfDay };
    }

    case "last_week": {
      const start = new Date(startOfDay);
      start.setUTCDate(start.getUTCDate() - 14);
      const end = new Date(startOfDay);
      end.setUTCDate(end.getUTCDate() - 7);
      return { start, end };
    }

    case "this_month": {
      const start = new Date(startOfDay);
      start.setUTCDate(start.getUTCDate() - 30);
      return { start, end: endOfDay };
    }

    case "last_month": {
      const start = new Date(startOfDay);
      start.setUTCDate(start.getUTCDate() - 60);
      const end = new Date(startOfDay);
      end.setUTCDate(end.getUTCDate() - 30);
      return { start, end };
    }

    case "all_time":
    default: {
      const start = new Date(0); // Epoch start
      return { start, end: endOfDay };
    }
  }
}

// ──────────────────────────────────────────────
// Concrete Providers
// ──────────────────────────────────────────────

class TaskHistoryProvider implements IHistoricalProvider {
  sourceName = "task" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const tasks = await Task.find({
      userId: query.userId,
      createdAt: { $gte: range.start, $lte: range.end },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return tasks.map((t: any) => ({
      id: t._id.toString(),
      source: "task",
      title: t.title || "Task",
      content: `Status: ${t.status || "active"} | Category: ${t.category || "general"}${t.completedAt ? ` | Completed: ${new Date(t.completedAt).toISOString()}` : ""}`,
      date: new Date(t.createdAt || t.updatedAt),
      score: 0,
      rawPayload: t,
    }));
  }
}

class GoalHistoryProvider implements IHistoricalProvider {
  sourceName = "goal" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const goals = await GoalProposal.find({
      userId: query.userId,
      createdAt: { $gte: range.start, $lte: range.end },
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return goals.map((g: any) => ({
      id: g._id.toString(),
      source: "goal",
      title: g.title || "Goal Proposal",
      content: `Status: ${g.status || "pending"} | Rationale: ${g.rationale || "N/A"}`,
      date: new Date(g.createdAt),
      score: 0,
      rawPayload: g,
    }));
  }
}

class DailyLogHistoryProvider implements IHistoricalProvider {
  sourceName = "daily_log" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const logs = await DailyLog.find({
      userId: query.userId,
      date: { $gte: range.start, $lte: range.end },
    })
      .sort({ date: -1 })
      .limit(60)
      .lean();

    return logs.map((l: any) => {
      const details = [
        l.sleepHours !== undefined ? `Sleep: ${l.sleepHours}h` : null,
        l.mood !== undefined ? `Mood: ${l.mood}/10` : null,
        l.energy !== undefined ? `Energy: ${l.energy}/10` : null,
        l.waterLiters !== undefined ? `Water: ${l.waterLiters}L` : null,
        l.steps !== undefined ? `Steps: ${l.steps}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return {
        id: l._id.toString(),
        source: "daily_log",
        title: `Daily Log ${l.date ? new Date(l.date).toISOString().split("T")[0] : ""}`,
        content: details || "Daily tracking record",
        date: new Date(l.date || l.createdAt),
        score: 0,
        rawPayload: l,
      };
    });
  }
}

class NutritionHistoryProvider implements IHistoricalProvider {
  sourceName = "nutrition" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const logs = await NutritionLog.find({
      userId: query.userId,
      timestamp: { $gte: range.start, $lte: range.end },
    })
      .sort({ timestamp: -1 })
      .limit(40)
      .lean();

    return logs.map((n: any) => ({
      id: n._id.toString(),
      source: "nutrition",
      title: n.mealName || "Meal Log",
      content: `Calories: ${n.calories || 0} kcal | P: ${n.protein || 0}g | C: ${n.carbs || 0}g | F: ${n.fat || 0}g`,
      date: new Date(n.timestamp || n.createdAt),
      score: 0,
      rawPayload: n,
    }));
  }
}

class WorkoutHistoryProvider implements IHistoricalProvider {
  sourceName = "workout" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const sessions = await WorkoutSession.find({
      userId: query.userId,
      startTime: { $gte: range.start, $lte: range.end },
    })
      .sort({ startTime: -1 })
      .limit(30)
      .lean();

    return sessions.map((w: any) => ({
      id: w._id.toString(),
      source: "workout",
      title: w.name || "Workout Session",
      content: `Status: ${w.status || "completed"} | Duration: ${w.durationMinutes || 0} mins | Exercises: ${(w.exercises || []).length}`,
      date: new Date(w.startTime || w.createdAt),
      score: 0,
      rawPayload: w,
    }));
  }
}

class MemoryHistoryProvider implements IHistoricalProvider {
  sourceName = "memory" as const;

  async retrieve(query: HistoricalQuery, range: { start: Date; end: Date }): Promise<HistoricalRecord[]> {
    const memories = Brain.getInstance().memory.getAllRecords();

    return memories
      .filter((m) => m.timestamp >= range.start.getTime() && m.timestamp <= range.end.getTime())
      .map((m) => ({
        id: m.id,
        source: "memory",
        title: `Memory [${m.category}]`,
        content: `Key: ${m.key} | Value: ${typeof m.value === "string" ? m.value : JSON.stringify(m.value)}`,
        date: new Date(m.timestamp),
        score: 0,
        rawPayload: m,
      }));
  }
}

// ──────────────────────────────────────────────
// HistoricalRetrievalEngine Main Subsystem
// ──────────────────────────────────────────────

/**
 * HistoricalRetrievalEngine (HRAG)
 * 
 * SOLE OWNER of historical retrieval.
 * Deterministically queries, filters, and ranks historical records
 * across all user tracking domains (tasks, goals, health, nutrition, workouts, memory).
 * 
 * ARCHITECTURAL RULES:
 * - NO vector DBs or embeddings
 * - NO LLM ranking or LLM retrieval calls
 * - MUST NOT format prompts or execute actions
 */
export class HistoricalRetrievalEngine {
  private static instance: HistoricalRetrievalEngine;

  private providers: IHistoricalProvider[] = [
    new TaskHistoryProvider(),
    new GoalHistoryProvider(),
    new DailyLogHistoryProvider(),
    new NutritionHistoryProvider(),
    new WorkoutHistoryProvider(),
    new MemoryHistoryProvider(),
  ];

  static getInstance(): HistoricalRetrievalEngine {
    if (!HistoricalRetrievalEngine.instance) {
      HistoricalRetrievalEngine.instance = new HistoricalRetrievalEngine();
    }
    return HistoricalRetrievalEngine.instance;
  }

  /**
   * Main entry point: Executes HRAG search given ConversationSemantics and user request.
   */
  async retrieve(
    userId: string,
    semantics: ConversationSemantics,
    messageText: string
  ): Promise<HistoricalSearchResult | null> {
    // Only execute if semantics indicate a historical query or explicit reference
    const isHistorical =
      semantics.conversationIntent === "query_history" ||
      semantics.historicalQuery ||
      semantics.entityReference?.recency === "historical" ||
      Boolean(semantics.timeWindow) ||
      this.detectHistoricalKeywords(messageText);

    if (!isHistorical) {
      return null;
    }

    const timeWindow: TimeWindow = semantics.timeWindow || this.detectTimeWindow(messageText) || "this_month";
    const dateRange = resolveDateRange(timeWindow);
    const keywords = semantics.historicalKeywords || this.extractKeywords(messageText);

    const query: HistoricalQuery = {
      userId,
      timeWindow,
      keywords,
      moduleContext: semantics.moduleContext,
      startDate: dateRange.start,
      endDate: dateRange.end,
    };

    console.log(
      `📜 [HRAG] Executing Historical Retrieval for User ${userId} (Window: ${timeWindow}, Keywords: [${keywords.join(", ")}])`
    );

    // Run all providers in parallel
    const providerResults = await Promise.all(
      this.providers.map(async (provider) => {
        try {
          return await provider.retrieve(query, dateRange);
        } catch (err) {
          console.error(`Error in HRAG provider [${provider.sourceName}]:`, err);
          return [];
        }
      })
    );

    const allRecords = providerResults.flat();

    // Rank records deterministically
    const rankedRecords = this.rankRecords(allRecords, query);

    console.log(`📜 [HRAG] Retrieved ${rankedRecords.length} historical record(s) across all domains.`);

    return {
      query,
      records: rankedRecords.slice(0, 15), // Bounded top 15 records
      totalFound: allRecords.length,
    };
  }

  /**
   * Deterministic Ranking Algorithm:
   * Score = RecencyScore (0.4) + KeywordMatchScore (0.4) + ModuleRelevance (0.2)
   */
  private rankRecords(records: HistoricalRecord[], query: HistoricalQuery): HistoricalRecord[] {
    if (!records.length) return [];

    const now = Date.now();
    const oldest = Math.min(...records.map((r) => r.date.getTime()));
    const timeRange = now - oldest || 1;

    return [...records]
      .map((r) => {
        // 1. Recency Score (0–1, newer = higher)
        const recencyScore = (r.date.getTime() - oldest) / timeRange;

        // 2. Keyword Match Score (0–1)
        let keywordScore = 0;
        if (query.keywords?.length) {
          const text = `${r.title} ${r.content}`.toLowerCase();
          const matches = query.keywords.filter((kw) => text.includes(kw.toLowerCase()));
          keywordScore = matches.length / query.keywords.length;
        }

        // 3. Module Relevance Score
        let moduleScore = 0;
        if (query.moduleContext && r.source.includes(query.moduleContext.toLowerCase())) {
          moduleScore = 1;
        }

        const totalScore = recencyScore * 0.4 + keywordScore * 0.4 + moduleScore * 0.2;

        return {
          ...r,
          score: Math.round(totalScore * 100) / 100,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /** Detects if user message is asking about historical trends or past events */
  private detectHistoricalKeywords(message: string): boolean {
    const text = message.toLowerCase();
    const patterns = [
      "last week",
      "last month",
      "yesterday",
      "history",
      "past",
      "how has my",
      "compare my",
      "when did i",
      "how many days",
      "have i missed",
      "abandoned",
      "in june",
      "in july",
      "previous",
    ];
    return patterns.some((p) => text.includes(p));
  }

  /** Detects time window from natural text heuristically */
  private detectTimeWindow(message: string): TimeWindow | null {
    const text = message.toLowerCase();
    if (text.includes("today")) return "today";
    if (text.includes("yesterday")) return "yesterday";
    if (text.includes("this week")) return "this_week";
    if (text.includes("last week")) return "last_week";
    if (text.includes("this month")) return "this_month";
    if (text.includes("last month")) return "last_month";
    return null;
  }

  /** Extracts keywords from message text excluding stop words */
  private extractKeywords(message: string): string[] {
    const stopWords = new Set([
      "how", "has", "my", "over", "the", "last", "did", "i", "when", "what",
      "in", "and", "or", "to", "for", "with", "on", "at", "by", "a", "an", "is", "was",
    ]);

    return message
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }
}
