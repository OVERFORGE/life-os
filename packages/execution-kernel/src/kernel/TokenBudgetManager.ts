import { CollectedContext } from "./ContextCollector";

export const DEFAULT_TOKEN_BUDGETS = {
  SYSTEM_BUDGET: 1500,
  SUMMARY_BUDGET: 1200,
  RECENT_MESSAGES_BUDGET: 2500,
  STM_BUDGET: 500,
  WORLD_BUDGET: 1800,
  MEMORY_BUDGET: 1200,
  KNOWLEDGE_BUDGET: 1200,
  HISTORICAL_BUDGET: 2000,
  EXECUTION_GRAPH_BUDGET: 1500,
  REPAIR_CONTEXT_BUDGET: 1500,
  TOOLS_BUDGET: 1000,
  TOTAL_BUDGET: 15000,
} as const;

export interface BudgetAllocation {
  trimmedContext: CollectedContext;
  estimatedTotalTokens: number;
  sectionBudgets: typeof DEFAULT_TOKEN_BUDGETS;
}

/**
 * TokenBudgetManager
 * 
 * SOLE OWNER of prompt size estimation and budget allocation.
 * Determines how much context each section may consume before prompt formatting.
 * 
 * TRIMMING PRIORITY ORDER (when over budget):
 * 1. Knowledge (trimmed first)
 * 2. Historical Context (HRAG)
 * 3. Repair Operations Log (trims extra operation details; NEVER trims current plan/diagnostics/stability)
 * 4. Long-Term Memory
 * 5. World Context
 * 6. Execution Graph
 * 7. Recent Messages
 * 
 * NEVER TRIMS:
 * - System Prompt
 * - Short-Term Memory
 * - Execution Truths (Tool Results)
 * - Current Repair Plan Summary & Stability Score
 */
export class TokenBudgetManager {
  private static instance: TokenBudgetManager;

  static getInstance(): TokenBudgetManager {
    if (!TokenBudgetManager.instance) {
      TokenBudgetManager.instance = new TokenBudgetManager();
    }
    return TokenBudgetManager.instance;
  }

  allocate(collected: CollectedContext): BudgetAllocation {
    const contextCopy: CollectedContext = {
      ...collected,
      recentMessages: [...collected.recentMessages],
      worldEntities: [...collected.worldEntities],
      longTermMemory: [...collected.longTermMemory],
      knowledge: [...collected.knowledge],
      historicalContext: collected.historicalContext
        ? {
            ...collected.historicalContext,
            records: [...collected.historicalContext.records],
          }
        : null,
      executionGraphSnapshot: collected.executionGraphSnapshot
        ? {
            ...collected.executionGraphSnapshot,
            readyNodes: [...collected.executionGraphSnapshot.readyNodes],
            blockedNodes: [...collected.executionGraphSnapshot.blockedNodes],
            criticalPath: [...collected.executionGraphSnapshot.criticalPath],
            executionPressure: [...collected.executionGraphSnapshot.executionPressure],
            parallelExecutionGroups: collected.executionGraphSnapshot.parallelExecutionGroups.map((g) => [...g]),
          }
        : null,
      repairPlan: collected.repairPlan
        ? {
            ...collected.repairPlan,
            operations: [...collected.repairPlan.operations],
          }
        : null,
      repairDiagnostics: collected.repairDiagnostics
        ? {
            ...collected.repairDiagnostics,
            warnings: [...collected.repairDiagnostics.warnings],
          }
        : null,
    };

    // 1. Section-level trimming — Knowledge
    let knowledgeTokens = this.estimateTokens(JSON.stringify(contextCopy.knowledge));
    while (knowledgeTokens > DEFAULT_TOKEN_BUDGETS.KNOWLEDGE_BUDGET && contextCopy.knowledge.length > 0) {
      contextCopy.knowledge.pop();
      knowledgeTokens = this.estimateTokens(JSON.stringify(contextCopy.knowledge));
    }

    // 2. Section-level trimming — Historical Context
    if (contextCopy.historicalContext?.records.length) {
      let histTokens = this.estimateTokens(JSON.stringify(contextCopy.historicalContext.records));
      while (histTokens > DEFAULT_TOKEN_BUDGETS.HISTORICAL_BUDGET && contextCopy.historicalContext.records.length > 0) {
        contextCopy.historicalContext.records.pop();
        histTokens = this.estimateTokens(JSON.stringify(contextCopy.historicalContext.records));
      }
    }

    // 3. Section-level trimming — Repair Context (trim individual operation logs if over REPAIR_CONTEXT_BUDGET)
    if (contextCopy.repairPlan?.operations.length) {
      let repairTokens = this.estimateTokens(JSON.stringify(contextCopy.repairPlan.operations));
      while (repairTokens > DEFAULT_TOKEN_BUDGETS.REPAIR_CONTEXT_BUDGET && contextCopy.repairPlan.operations.length > 0) {
        contextCopy.repairPlan.operations.pop();
        repairTokens = this.estimateTokens(JSON.stringify(contextCopy.repairPlan.operations));
      }
    }

    // 4. Section-level trimming — Long-Term Memory
    let memoryTokens = this.estimateTokens(JSON.stringify(contextCopy.longTermMemory));
    while (memoryTokens > DEFAULT_TOKEN_BUDGETS.MEMORY_BUDGET && contextCopy.longTermMemory.length > 0) {
      contextCopy.longTermMemory.pop();
      memoryTokens = this.estimateTokens(JSON.stringify(contextCopy.longTermMemory));
    }

    // 5. Section-level trimming — World Entities
    let worldTokens = this.estimateTokens(JSON.stringify(contextCopy.worldEntities));
    while (worldTokens > DEFAULT_TOKEN_BUDGETS.WORLD_BUDGET && contextCopy.worldEntities.length > 0) {
      contextCopy.worldEntities.pop();
      worldTokens = this.estimateTokens(JSON.stringify(contextCopy.worldEntities));
    }

    // 6. Section-level trimming — Execution Graph
    if (contextCopy.executionGraphSnapshot) {
      let graphTokens = this.estimateTokens(JSON.stringify(contextCopy.executionGraphSnapshot));
      const criticalPathIds = new Set(contextCopy.executionGraphSnapshot.criticalPath.map((n) => n.id));

      while (
        graphTokens > DEFAULT_TOKEN_BUDGETS.EXECUTION_GRAPH_BUDGET &&
        contextCopy.executionGraphSnapshot.executionPressure.length > 0
      ) {
        const lowestIdx = [...contextCopy.executionGraphSnapshot.executionPressure]
          .reverse()
          .findIndex((p) => !criticalPathIds.has(p.nodeId));

        if (lowestIdx !== -1) {
          const actualIdx = contextCopy.executionGraphSnapshot.executionPressure.length - 1 - lowestIdx;
          const removed = contextCopy.executionGraphSnapshot.executionPressure.splice(actualIdx, 1)[0];
          contextCopy.executionGraphSnapshot.readyNodes = contextCopy.executionGraphSnapshot.readyNodes.filter(
            (n) => n.id !== removed.nodeId
          );
        } else {
          break;
        }

        graphTokens = this.estimateTokens(JSON.stringify(contextCopy.executionGraphSnapshot));
      }
    }

    // 7. Section-level trimming — Recent Messages
    let msgTokens = this.estimateTokens(JSON.stringify(contextCopy.recentMessages));
    while (msgTokens > DEFAULT_TOKEN_BUDGETS.RECENT_MESSAGES_BUDGET && contextCopy.recentMessages.length > 2) {
      contextCopy.recentMessages.shift();
      msgTokens = this.estimateTokens(JSON.stringify(contextCopy.recentMessages));
    }

    // 8. Overall Total Budget Enforcement (Priority Order)
    let totalTokens = this.calculateTotalTokens(contextCopy);

    // Priority 1: Knowledge
    if (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.knowledge.length > 0) {
      contextCopy.knowledge = [];
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    // Priority 2: Historical Context
    if (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.historicalContext?.records.length) {
      contextCopy.historicalContext.records = [];
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    // Priority 3: Long-Term Memory
    if (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.longTermMemory.length > 0) {
      contextCopy.longTermMemory = [];
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    // Priority 4: World Entities
    if (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.worldEntities.length > 0) {
      contextCopy.worldEntities = [];
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    // Priority 5: Recent Messages
    while (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.recentMessages.length > 2) {
      contextCopy.recentMessages.shift();
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    // Last resort: Trim summary if still over budget
    if (totalTokens > DEFAULT_TOKEN_BUDGETS.TOTAL_BUDGET && contextCopy.conversationSummary) {
      const summaryChars = DEFAULT_TOKEN_BUDGETS.SUMMARY_BUDGET * 4;
      contextCopy.conversationSummary = contextCopy.conversationSummary.slice(0, summaryChars) + "...";
      totalTokens = this.calculateTotalTokens(contextCopy);
    }

    return {
      trimmedContext: contextCopy,
      estimatedTotalTokens: totalTokens,
      sectionBudgets: DEFAULT_TOKEN_BUDGETS,
    };
  }

  /** Estimate tokens (~4 chars per token). */
  private estimateTokens(text: string): number {
    return Math.ceil((text || "").length / 4);
  }

  private calculateTotalTokens(ctx: CollectedContext): number {
    const raw =
      (ctx.conversationSummary || "") +
      JSON.stringify(ctx.recentMessages) +
      JSON.stringify(ctx.shortTermMemory || {}) +
      JSON.stringify(ctx.worldEntities) +
      JSON.stringify(ctx.worldState) +
      JSON.stringify(ctx.longTermMemory) +
      JSON.stringify(ctx.knowledge) +
      JSON.stringify(ctx.historicalContext?.records || []) +
      JSON.stringify(ctx.executionGraphSnapshot || {}) +
      JSON.stringify(ctx.repairPlan || {}) +
      JSON.stringify(ctx.repairDiagnostics || {}) +
      JSON.stringify(ctx.toolResults);

    return this.estimateTokens(raw) + DEFAULT_TOKEN_BUDGETS.SYSTEM_BUDGET;
  }
}
