import { Brain } from "../brain/Brain";
import { ExecutionOutcome, ExecutionOutcomeType } from "./ExecutionOutcome";
import { createEntity, EntityTypes } from "../brain/knowledge/Entity";

export class ReflectionEngine {
  private brain: Brain;
  private handlers: Record<ExecutionOutcomeType, (outcome: ExecutionOutcome) => void>;

  constructor() {
    this.brain = Brain.getInstance();
    this.handlers = {
      TaskCompleted: (outcome) => this.handleTaskCompleted(outcome),
      MealLogged: (outcome) => this.handleMealLogged(outcome),
      GoalCreated: (outcome) => this.handleGoalCreated(outcome),
      WorkoutLogged: (outcome) => this.handleWorkoutLogged(outcome),
      WeightUpdated: (outcome) => this.handleWeightUpdated(outcome),
      GeneralRecorded: (outcome) => this.handleGeneralRecorded(outcome),
    };
  }

  static getInstance(): ReflectionEngine {
    return new ReflectionEngine();
  }

  reflect(outcomes: ExecutionOutcome[]): void {
    for (const outcome of outcomes) {
      const handler = this.handlers[outcome.type];
      if (handler) {
        handler(outcome);
      }
    }
  }

  private handleTaskCompleted(outcome: ExecutionOutcome): void {
    const prod = this.brain.state.getDomain("productivity");
    const currentTasks = prod.activeTaskCount || 0;
    this.brain.state.updateDomain("productivity", {
      activeTaskCount: Math.max(0, currentTasks - 1),
    });
    this.brain.memory.addRecord("Episodic", "task_completed", outcome.payload.title || "Task");
  }

  private handleMealLogged(outcome: ExecutionOutcome): void {
    const health = this.brain.state.getDomain("health");
    this.brain.state.updateDomain("health", {
      caloriesLogged: (health.caloriesLogged || 0) + (outcome.result.calories || 0),
      proteinLogged: (health.proteinLogged || 0) + (outcome.result.protein || 0),
    });
    this.brain.memory.addRecord("Episodic", "meal_logged", outcome.payload.description || "Meal");
  }

  private handleGoalCreated(outcome: ExecutionOutcome): void {
    if (outcome.result.id) {
      const entity = createEntity(outcome.result.id, EntityTypes.Goal, {
        ...outcome.payload,
        ...outcome.result,
      });
      this.brain.knowledge.setEntity(entity);
    }
    this.brain.memory.addRecord("Episodic", "goal_created", outcome.payload.title || "Goal");
  }

  private handleWorkoutLogged(outcome: ExecutionOutcome): void {
    this.brain.memory.addRecord("Episodic", "workout_logged", outcome.payload.description || "Workout");
  }

  private handleWeightUpdated(outcome: ExecutionOutcome): void {
    const health = this.brain.state.getDomain("health");
    if (outcome.payload.weight) {
      this.brain.state.updateDomain("health", {
        weightKg: Number(outcome.payload.weight),
      });
    }
    this.brain.memory.addRecord("Episodic", "weight_updated", outcome.payload.weight);
  }

  private handleGeneralRecorded(outcome: ExecutionOutcome): void {
    if (outcome.payload.title || outcome.payload.description) {
      this.brain.memory.addRecord(
        "Working",
        "action_executed",
        outcome.payload.title || outcome.payload.description
      );
    }
  }
}
