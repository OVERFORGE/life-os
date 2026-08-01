import { KernelRuntime } from "./kernel/KernelRuntime";
import { HandleInput } from "./kernel/KernelEngine";
import { getActiveDate, isPastHour, parseLocalToUTC } from "./automation/timeUtils";
import { EventBus } from "./events/EventBus";
import { KernelEvent } from "./events/Event";
import { ExecutionContext } from "./runtime/ExecutionContext";
import { Brain } from "./brain/Brain";
import { generateId } from "./shared/ids";
import { EntityTypes, EntityType } from "./brain/knowledge/Entity";
import { Reasoner } from "./reasoning/Reasoner";
import { Understanding } from "./reasoning/Understanding";
import { Planner } from "./planning/Planner";
import { Plan, IntendedAction } from "./planning/Plan";
import { PlanMapper } from "./planning/PlanMapper";
import { PlanCompiler } from "./planning/PlanCompiler";
import { Job } from "./scheduling/Job";
import { Scheduler } from "./scheduling/Scheduler";
import { Dispatcher } from "./dispatch/Dispatcher";
import { JobMapper } from "./dispatch/JobMapper";
import { WorldModel } from "./world/WorldModel";
import { WorldSnapshot } from "./world/WorldSnapshot";
import { ReflectionEngine } from "./reflection/ReflectionEngine";
import { ExecutionOutcome, ExecutionOutcomeType, mapLegacyResultToOutcome } from "./reflection/ExecutionOutcome";
import { PredictionEngine } from "./prediction/PredictionEngine";
import { Prediction } from "./prediction/Prediction";
import { InsightEngine } from "./insights/InsightEngine";
import { Insight } from "./insights/Insight";
import { ProactiveEngine } from "./proactive/ProactiveEngine";
import { Suggestion, SuggestionPriority } from "./proactive/Suggestion";

export class Kernel {
  static async initialize(): Promise<void> {
    return KernelRuntime.getInstance().initialize();
  }

  static async handle(input: HandleInput): Promise<Response> {
    return KernelRuntime.getInstance().handle(input);
  }

  static async runAutomation(userId: string) {
    return KernelRuntime.getInstance().runAutomation(userId);
  }
}

export {
  getActiveDate,
  isPastHour,
  parseLocalToUTC,
  EventBus,
  ExecutionContext,
  Brain,
  WorldModel,
  PredictionEngine,
  InsightEngine,
  ProactiveEngine,
  Reasoner,
  Planner,
  PlanMapper,
  PlanCompiler,
  Scheduler,
  Dispatcher,
  JobMapper,
  ReflectionEngine,
  mapLegacyResultToOutcome,
  generateId,
  EntityTypes,
};
export type {
  HandleInput,
  KernelEvent,
  EntityType,
  Understanding,
  Plan,
  IntendedAction,
  Job,
  WorldSnapshot,
  ExecutionOutcome,
  ExecutionOutcomeType,
  Prediction,
  Insight,
  Suggestion,
  SuggestionPriority,
};
