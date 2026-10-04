/**
 * Deliberative Planning Graph (Phase 10 LangGraph Pilot)
 * 
 * Implements a StateGraph using @langchain/langgraph for complex multi-step
 * goal decomposition and deliberative planning.
 * 
 * Invariants:
 * - Belongs strictly to the Intelligence tier.
 * - Proposes ActionProposal[] ONLY. Zero direct mutations of database or state.
 * - Enforces recursionLimit: 10 as an operational safety ceiling.
 * - Checkpointed with MemorySaver for human-in-the-loop (HITL) resumption.
 */

import { Annotation, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { KernelCapabilityToolBridge } from "./adapters/KernelCapabilityToolBridge";
import { IDeliberativePlanResult } from "./contracts/LangGraphPilotContracts";
import { generateId } from "../../shared/ids";

// Define LangGraph State Annotation
export const DeliberativeState = Annotation.Root({
  executionId: Annotation<string>(),
  userId: Annotation<string>(),
  goal: Annotation<string>(),
  context: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  subGoals: Annotation<string[]>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  dependencies: Annotation<Array<{ from: string; to: string }>>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  cycleDetected: Annotation<boolean>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => false,
  }),
  proposals: Annotation<ActionProposal[]>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  synthesis: Annotation<string>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => "",
  }),
  interruptedForHITL: Annotation<boolean>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => false,
  }),
  stepCount: Annotation<number>({
    reducer: (x, y) => (y !== undefined ? x + y : x),
    default: () => 0,
  }),
});

export type DeliberativeStateType = typeof DeliberativeState.State;

export class DeliberativePlanningGraph {
  private static instance: DeliberativePlanningGraph;
  private checkpointer: MemorySaver;
  private app: any;
  private toolBridge: KernelCapabilityToolBridge;

  constructor(toolBridge: KernelCapabilityToolBridge = KernelCapabilityToolBridge.getInstance()) {
    this.toolBridge = toolBridge;
    this.checkpointer = new MemorySaver();
    this.app = this.buildGraph().compile({ checkpointer: this.checkpointer });
  }

  static getInstance(): DeliberativePlanningGraph {
    if (!DeliberativePlanningGraph.instance) {
      DeliberativePlanningGraph.instance = new DeliberativePlanningGraph();
    }
    return DeliberativePlanningGraph.instance;
  }

  private buildGraph() {
    const workflow = new StateGraph(DeliberativeState)
      .addNode("decompose_goal", async (state: DeliberativeStateType) => {
        if (state.subGoals && state.subGoals.length > 0) {
          return { stepCount: 1 };
        }
        const subGoals: string[] = [];
        const goalLower = state.goal.toLowerCase();

        // Structured decomposition
        if (goalLower.includes("marathon") || goalLower.includes("training")) {
          subGoals.push("Schedule Sunday Long Run Window");
          subGoals.push("Protect Recovery Nutrition Window");
          subGoals.push("Reschedule Non-Urgent Review Meetings");
        } else if (goalLower.includes("reorganize") || goalLower.includes("restructure")) {
          subGoals.push("Audit Active Project Commitments");
          subGoals.push("Identify Deprioritized Backlog Items");
          subGoals.push("Create Strategic Deep Work Windows");
        } else {
          subGoals.push(`Deconstruct Milestone: ${state.goal}`);
          subGoals.push("Establish Dependency Sequence");
        }

        return {
          subGoals,
          stepCount: 1,
        };
      })
      .addNode("detect_dependencies_and_cycles", async (state: DeliberativeStateType) => {
        // Check for cyclic dependencies in input
        const deps = state.dependencies || [];
        let hasCycle = false;

        // Check for direct cycles: A -> B and B -> A
        for (const d1 of deps) {
          for (const d2 of deps) {
            if (d1.from === d2.to && d1.to === d2.from) {
              hasCycle = true;
              break;
            }
          }
        }

        if (hasCycle) {
          return {
            cycleDetected: true,
            interruptedForHITL: true,
            synthesis: "Circular dependency detected between proposed milestones. Halting for user clarification.",
            stepCount: 1,
          };
        }

        return {
          cycleDetected: false,
          interruptedForHITL: false,
          stepCount: 1,
        };
      })
      .addNode("consult_specialist_tools", async (state: DeliberativeStateType) => {
        const proposals: ActionProposal[] = [];

        for (const sub of state.subGoals) {
          if (sub.includes("Run") || sub.includes("Work") || sub.includes("Window")) {
            const toolRes = await this.toolBridge.invokeTool("propose_schedule_block", {
              label: sub,
              startTimestamp: Date.now() + 86400000,
              durationMinutes: 90,
            });
            if (toolRes.proposal) proposals.push(toolRes.proposal);
          } else {
            const toolRes = await this.toolBridge.invokeTool("propose_task_creation", {
              title: sub,
              priority: "HIGH",
            });
            if (toolRes.proposal) proposals.push(toolRes.proposal);
          }
        }

        return {
          proposals,
          stepCount: 1,
        };
      })
      .addNode("synthesize_plan", async (state: DeliberativeStateType) => {
        const synthesis = `Synthesized structured multi-step plan containing ${state.proposals.length} proposed actions.`;
        return {
          synthesis,
          stepCount: 1,
        };
      })
      .addEdge(START, "decompose_goal")
      .addEdge("decompose_goal", "detect_dependencies_and_cycles")
      .addConditionalEdges(
        "detect_dependencies_and_cycles",
        (state: DeliberativeStateType) => {
          if (state.cycleDetected || state.interruptedForHITL) {
            return END;
          }
          return "consult_specialist_tools";
        }
      )
      .addEdge("consult_specialist_tools", "synthesize_plan")
      .addEdge("synthesize_plan", END);

    return workflow;
  }

  /**
   * Executes deliberative planning workflow through LangGraph.
   */
  async executePlan(
    userId: string,
    goal: string,
    context: Record<string, any> = {},
    dependencies: Array<{ from: string; to: string }> = []
  ): Promise<IDeliberativePlanResult> {
    const executionId = generateId("lg_exec");
    const threadId = `thread_${userId}_${executionId}`;
    const startTime = performance.now();
    const startMem = process.memoryUsage().heapUsed;

    const initialState: DeliberativeStateType = {
      executionId,
      userId,
      goal,
      context,
      subGoals: [],
      dependencies,
      cycleDetected: false,
      proposals: [],
      synthesis: "",
      interruptedForHITL: false,
      stepCount: 0,
    };

    const config = {
      configurable: { thread_id: threadId },
      recursionLimit: 10, // Operational safety ceiling
    };

    const finalState = await this.app.invoke(initialState, config);

    const durationMs = performance.now() - startTime;
    const endMem = process.memoryUsage().heapUsed;
    const memoryDeltaMb = Math.max(0, (endMem - startMem) / (1024 * 1024));

    return {
      executionId,
      userId,
      proposedActionSequence: finalState.proposals || [],
      synthesisRationale: finalState.synthesis || "",
      interruptedForHITL: finalState.interruptedForHITL || false,
      cycleDetected: finalState.cycleDetected || false,
      checkpointId: threadId,
      metrics: {
        stepCount: finalState.stepCount || 4,
        durationMs,
        memoryDeltaMb,
      },
    };
  }

  /**
   * Resumes graph from a previous checkpoint for human-in-the-loop workflows.
   */
  async resumeFromCheckpoint(
    threadId: string,
    userResolutionUpdate: Partial<DeliberativeStateType>
  ): Promise<IDeliberativePlanResult> {
    const startTime = performance.now();
    const startMem = process.memoryUsage().heapUsed;

    const config = {
      configurable: { thread_id: threadId },
      recursionLimit: 10,
    };

    // Update state to resolve HITL
    const resumedState = await this.app.invoke(
      {
        ...userResolutionUpdate,
        cycleDetected: false,
        interruptedForHITL: false,
      },
      config
    );

    const durationMs = performance.now() - startTime;
    const endMem = process.memoryUsage().heapUsed;
    const memoryDeltaMb = Math.max(0, (endMem - startMem) / (1024 * 1024));

    return {
      executionId: resumedState.executionId,
      userId: resumedState.userId,
      proposedActionSequence: resumedState.proposals || [],
      synthesisRationale: resumedState.synthesis || "",
      interruptedForHITL: false,
      checkpointId: threadId,
      metrics: {
        stepCount: resumedState.stepCount || 1,
        durationMs,
        memoryDeltaMb,
      },
    };
  }
}
