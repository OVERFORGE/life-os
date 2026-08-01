import { CollectedContext } from "./ContextCollector";
import { BudgetAllocation } from "./TokenBudgetManager";

/**
 * PromptPayload
 *
 * The final object consumed by ResponseGenerator.
 * Contains only prompt-ready information — no raw DB records.
 */
export interface PromptPayload {
  systemPrompt: string;
  userMessage: string;
  model?: string;
}

/**
 * ContextBuilder
 *
 * Transforms CollectedContext + BudgetAllocation into a PromptPayload.
 */
export class ContextBuilder {
  private static instance: ContextBuilder;

  static getInstance(): ContextBuilder {
    if (!ContextBuilder.instance) {
      ContextBuilder.instance = new ContextBuilder();
    }
    return ContextBuilder.instance;
  }

  build(
    rawCollected: CollectedContext,
    budget: BudgetAllocation,
    userMessage: string,
    model?: string
  ): PromptPayload {
    const collected = budget.trimmedContext;
    const now = new Date();
    const sections: string[] = [];

    // ── Section 1: System Identity ─────────────────────────────────────
    sections.push(`You are LifeOS, a strict behavioral intelligence assistant.
Today's date: ${now.toISOString().split("T")[0]}.
You must ground every response in the system context provided below.`);

    // ── Section 2: Conversation Summary ───────────────────────────────
    if (collected.conversationSummary) {
      sections.push(this.section("CONVERSATION SUMMARY", collected.conversationSummary));
    }

    // ── Section 3: Recent Dialogue ─────────────────────────────────────
    if (collected.recentMessages.length > 0) {
      const dialogue = collected.recentMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
      sections.push(this.section("RECENT MESSAGES", dialogue));
    }

    // ── Section 4: Short-Term Memory ──────────────────────────────────
    if (collected.shortTermMemory) {
      const stm = collected.shortTermMemory;
      const stmLines: string[] = [];
      if (stm.activeEntity) {
        stmLines.push(`Active Entity: [${stm.activeEntity.type}] "${stm.activeEntity.name}" (ID: ${stm.activeEntity.id})`);
      }
      if (stm.pendingConfirmations?.length) {
        stmLines.push(`Pending Confirmation: ${stm.pendingConfirmations[0].description}`);
      }
      if (stm.currentWorkflow) {
        stmLines.push(`Current Workflow: ${stm.currentWorkflow}`);
      }
      if (stmLines.length > 0) {
        sections.push(this.section("SHORT-TERM MEMORY", stmLines.join("\n")));
      }
    }

    // ── Section 5: Macro Life State & Canonical Reality (World Model V2)
    if (collected.worldSnapshotV2) {
      const w = collected.worldSnapshotV2;
      const wLines: string[] = [];

      wLines.push(`Macro Life State: [${w.lifeState.state}] (Confidence: ${Math.round(w.lifeState.confidence * 100)}%)`);
      wLines.push(`Reasoning: ${w.lifeState.explanation}`);
      if (w.lifeState.evidence.length > 0) {
        wLines.push(`Supporting Evidence:\n` + w.lifeState.evidence.map((e) => `  - ${e}`).join("\n"));
      }

      sections.push(this.section("MACRO LIFE STATE & CANONICAL REALITY (World Model V2)", wLines.join("\n\n")));
    }

    // ── Section 6: Goal Pressures & Project States (World Model V2) ────
    if (collected.worldSnapshotV2) {
      const w = collected.worldSnapshotV2;
      const gpLines: string[] = [];

      if (w.goalPressures.length > 0) {
        gpLines.push(
          `Goal Execution Pressures:\n` +
            w.goalPressures
              .map((g) => `  - [${g.goalTitle}] Pressure Score: ${g.pressureScore}/100 (${g.trend}) — ${g.explanation}`)
              .join("\n")
        );
      }

      if (w.projectStates.length > 0) {
        gpLines.push(
          `Active Project States:\n` +
            w.projectStates
              .map((p) => `  - [${p.projectTitle}] Status: ${p.status} | Completion: ${p.completionPercentage}% | Risk: ${p.riskLevel} | ${p.dependencyHealth}`)
              .join("\n")
        );
      }

      if (gpLines.length > 0) {
        sections.push(this.section("GOAL PRESSURES & PROJECT STATES", gpLines.join("\n\n")));
      }
    }

    // ── Section 7: Behavioral Learning & Signals ──────────────────────
    if (collected.behavioralProfile || collected.learningSignals.length > 0) {
      const learnLines: string[] = [];

      if (collected.behavioralProfile) {
        const p = collected.behavioralProfile;
        learnLines.push(
          `User Behavioral Profile:\n` +
            `  - Work Hours: ${p.preferredWorkHours.startHour}:00 - ${p.preferredWorkHours.endHour}:00\n` +
            `  - Task Completion Rate: ${Math.round(p.taskCompletionRate * 100)}%\n` +
            `  - Execution Consistency: ${Math.round(p.executionConsistency * 100)}%\n` +
            `  - Preferred Routines: ${p.preferredRoutineOrder.join(" → ")}`
        );
      }

      if (collected.learningSignals.length > 0) {
        learnLines.push(
          `Active Learning Signals:\n` +
            collected.learningSignals
              .map((s) => `  - [${s.type}] ${s.title}: ${s.message} (Confidence: ${s.confidence})`)
              .join("\n")
        );
      }

      sections.push(this.section("BEHAVIORAL LEARNING & ADAPTIVE SIGNALS", learnLines.join("\n\n")));
    }

    // ── Section 8: Trends & World Predictions (World Model V2) ────────
    if (collected.worldSnapshotV2) {
      const w = collected.worldSnapshotV2;
      const predLines: string[] = [];

      if (w.trends.length > 0) {
        predLines.push(
          `Detected World Trends:\n` +
            w.trends.map((t) => `  - [${t.metricName}] ${t.trend}: ${t.changeDescription}`).join("\n")
        );
      }

      if (w.predictions.length > 0) {
        predLines.push(
          `Deterministic World Predictions:\n` +
            w.predictions.map((p) => `  - [${p.type}] ${p.title}: ${p.predictionText} (Confidence: ${Math.round(p.confidence * 100)}%)`).join("\n")
        );
      }

      if (predLines.length > 0) {
        sections.push(this.section("WORLD TRENDS & PREDICTIONS", predLines.join("\n\n")));
      }
    }

    // ── Section 9: World Context ───────────────────────────────────────
    const worldLines: string[] = [];

    if (collected.worldState) {
      worldLines.push(`User State: ${JSON.stringify(collected.worldState, null, 2)}`);
    }
    if (collected.worldEntities?.length > 0) {
      worldLines.push(
        `Active Entities (${collected.worldEntities.length}):\n` +
          collected.worldEntities
            .map((e) => `  - [${e.type}] "${e.name}" ${JSON.stringify(e.attributes)}`)
            .join("\n")
      );
    }
    if (worldLines.length > 0) {
      sections.push(this.section("WORLD CONTEXT", worldLines.join("\n\n")));
    }

    // ── Section 10: Long-Term Memory ───────────────────────────────────
    if (collected.longTermMemory?.length > 0) {
      const memoryText = collected.longTermMemory
        .map((m) => `  [${m.category}] ${m.content}`)
        .join("\n");
      sections.push(this.section("LONG-TERM MEMORY", memoryText));
    }

    // ── Section 11: Knowledge ──────────────────────────────────────────
    if (collected.knowledge?.length > 0) {
      const knowledgeText = collected.knowledge
        .map((k) => `  [${k.title}]: ${k.content}`)
        .join("\n");
      sections.push(this.section("KNOWLEDGE", knowledgeText));
    }

    // ── Section 12: Historical Context (HRAG) ──────────────────────────
    if (collected.historicalContext?.records?.length) {
      const h = collected.historicalContext;
      const recordText = h.records
        .map(
          (r) =>
            `  - [${r.source.toUpperCase()}] "${r.title}" (${new Date(r.date).toISOString().split("T")[0]})\n    ${r.content}`
        )
        .join("\n");

      sections.push(
        this.section(
          "HISTORICAL CONTEXT",
          `Time Window: ${h.query.timeWindow || "custom"} (Found: ${h.totalFound} records, showing top ${h.records.length}):\n${recordText}`
        )
      );
    }

    // ── Section 13: Execution Graph Topology ───────────────────────────
    if (collected.executionGraphSnapshot) {
      const g = collected.executionGraphSnapshot;
      const graphLines: string[] = [];

      graphLines.push(`Topology Stats: ${g.nodeCount} node(s), ${g.edgeCount} edge(s)`);

      if (g.criticalPath.length > 0) {
        graphLines.push(
          `Critical Path (Longest Dependency Chain):\n` +
            g.criticalPath.map((n, i) => `  ${i + 1}. [${n.entityType}] "${n.title}" (${n.status})`).join(" →\n")
        );
      }

      if (g.readyNodes.length > 0) {
        graphLines.push(
          `Ready for Execution:\n` +
            g.readyNodes.map((n) => `  - [${n.entityType}] "${n.title}" (Priority: ${n.priority})`).join("\n")
        );
      }

      if (g.blockedNodes.length > 0) {
        graphLines.push(
          `Blocked Nodes:\n` +
            g.blockedNodes.map((b) => `  - [${b.node.entityType}] "${b.node.title}" — ${b.reason}`).join("\n")
        );
      }

      if (g.executionPressure.length > 0) {
        graphLines.push(
          `Top Execution Pressure Nodes:\n` +
            g.executionPressure
              .slice(0, 5)
              .map((p) => `  - Node ${p.nodeId} (Score: ${p.score}) Factors: ${p.contributingFactors.join(", ")}`)
              .join("\n")
        );
      }

      if (g.parallelExecutionGroups.length > 0) {
        graphLines.push(
          `Parallel Execution Waves:\n` +
            g.parallelExecutionGroups
              .map(
                (wave, i) =>
                  `  Wave ${i + 1}: [${wave.map((n) => `"${n.title}"`).join(", ")}]`
              )
              .join("\n")
        );
      }

      if (g.cycleDiagnostics.length > 0) {
        graphLines.push(`🔥 CYCLE WARNINGS:\n` + g.cycleDiagnostics.map((c) => `  - ${c}`).join("\n"));
      }

      sections.push(this.section("EXECUTION GRAPH TOPOLOGY", graphLines.join("\n\n")));
    }

    // ── Section 14: Execution Repair System ────────────────────────────
    if (collected.repairPlan || collected.repairDiagnostics) {
      const p = collected.repairPlan;
      const d = collected.repairDiagnostics;
      const repairLines: string[] = [];

      if (p) {
        repairLines.push(`Repair Trigger: ${p.trigger} | Estimated Repair Cost: ${p.estimatedCost}`);
        repairLines.push(`Total Operations: ${p.totalOperations} | Max Repair Depth: ${p.maxRepairDepth}`);

        if (p.operations.length > 0) {
          repairLines.push(
            `Automated Repair Operations Executed:\n` +
              p.operations
                .map((op) => `  - [${op.type}] "${op.targetTitle}": ${op.details}`)
                .join("\n")
          );
        }
      }

      if (d) {
        repairLines.push(`Graph Stability Score: ${d.stabilityScore}/100`);

        if (d.propagationChain.length > 0) {
          repairLines.push(`Propagation Chain:\n` + d.propagationChain.map((c) => `  - ${c}`).join("\n"));
        }

        if (d.deadNodeIds.length > 0) {
          repairLines.push(`Dead Nodes (Unreachable): [${d.deadNodeIds.join(", ")}]`);
        }

        if (d.orphanNodeIds.length > 0) {
          repairLines.push(`Orphan Nodes (No parent/workflow): [${d.orphanNodeIds.join(", ")}]`);
        }

        if (d.warnings.length > 0) {
          repairLines.push(`Diagnostics Warnings:\n` + d.warnings.map((w) => `  - ⚠️ ${w}`).join("\n"));
        }
      }

      sections.push(this.section("EXECUTION REPAIR SYSTEM", repairLines.join("\n\n")));
    }

    // ── Section 15: Execution Truths (Tool Results) ────────────────────
    if (collected.toolResults?.length > 0) {
      const criticalInstructions = collected.toolResults
        .filter((tr) => tr.data?.ai_instruction)
        .map((tr) => tr.data.ai_instruction)
        .join("\n");

      const truthText =
        `SYSTEM EXECUTION TRUTHS (MANDATORY TO ACKNOWLEDGE):\n` +
        JSON.stringify(collected.toolResults, null, 2) +
        (criticalInstructions ? `\n\n🔥 CRITICAL SYSTEM DIRECTIVE:\n${criticalInstructions}` : "");
      sections.push(this.section("EXECUTION TRUTHS", truthText));
    } else {
      sections.push(this.section("EXECUTION TRUTHS", "No new DB actions taken this request."));
    }

    // ── Section 16: Response Rules ─────────────────────────────────────
    sections.push(`### RESPONSE RULES:
1. TRUTH PRIORITY: Base your reality on EXECUTION TRUTHS.
2. MACRO LIFE STATE: Ground your tone and operational recommendations in the user's Macro Life State (${collected.worldSnapshotV2?.lifeState.state || "Stable"}).
3. ADAPTIVE REPAIR: Explain what changed, what was automatically repaired, and what remains blocked.
4. BEHAVIORAL ALIGNMENT: Ground responses in the user's Behavioral Profile and Learning Signals.
5. EXECUTION TOPOLOGY: Prioritize actions on the Critical Path and Ready Nodes.
6. HISTORICAL ACCURACY: Ground past answers in the HISTORICAL CONTEXT section.`);

    return {
      systemPrompt: sections.join("\n\n"),
      userMessage,
      model,
    };
  }

  /** Wraps content in a clearly delineated section block. */
  private section(title: string, content: string): string {
    const bar = "=".repeat(40);
    return `${bar}\n${title}\n${bar}\n${content}`;
  }
}
