import { ExecutionContext } from "../runtime/ExecutionContext";
import { Understanding } from "../reasoning/Understanding";
import { Plan, IntendedAction, createPlan } from "./Plan";
import { NativePlanningStrategy } from "./NativePlanningStrategy";

export interface PlanInput {
  message: string;
  goalTitles?: string;
  existingSignalsList?: string;
  historyText?: string;
  model?: string;
  mode?: string;
  timezone?: string;
}

export class Planner {
  private planningStrategy: NativePlanningStrategy;

  constructor() {
    this.planningStrategy = NativePlanningStrategy.getInstance();
  }

  static getInstance(): Planner {
    return new Planner();
  }

  async plan(
    understanding: Understanding,
    input: PlanInput,
    context: ExecutionContext
  ): Promise<Plan> {
    // If the Reasoner determined no strategic planning is required, return an empty Plan
    if (!understanding.requiresPlanning) {
      return createPlan(understanding.understandingId, [], "No action required");
    }

    // Generate intended actions natively using decoupled NativePlanningStrategy
    const intendedActions: IntendedAction[] = await this.planningStrategy.extractIntendedActions(
      input.message,
      understanding.situation,
      input.goalTitles || "",
      input.historyText || "",
      input.model
    );

    return createPlan(understanding.understandingId, intendedActions);
  }
}
