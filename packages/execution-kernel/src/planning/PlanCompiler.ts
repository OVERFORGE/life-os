import { Plan } from "./Plan";
import { Job, createJobFromAction } from "../scheduling/Job";

/**
 * PlanCompiler
 * 
 * Compiles an implementation-independent Plan produced by the Planner
 * into an array of executable Job units for the Scheduler.
 */
export class PlanCompiler {
  static compile(plan: Plan): Job[] {
    return plan.actions.map((action) => createJobFromAction(action));
  }
}
