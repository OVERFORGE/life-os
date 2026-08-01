import { SubsystemName } from "../diagnostics/DiagnosticSnapshot";

/**
 * KernelConfig Module
 * 
 * Centralized immutable configuration constants for LifeOS Kernel V1.
 * Eliminates magic strings and magic numbers across diagnostic, profiling, and runtime subsystems.
 */
export const KERNEL_CONFIG = {
  VERSION: "1.0.0-V1",
  DEFAULT_MODE: "general",
  DEFAULT_TIMEZONE: "UTC",
  
  SUBSYSTEMS: [
    "Conversation",
    "Reasoner",
    "Planner",
    "Scheduler",
    "Dispatcher",
    "Reflection",
    "AdaptiveRepair",
    "LearningEngine",
    "WorldModelV2",
    "HistoricalRetrieval",
    "ContextCollector",
    "TokenBudgetManager",
    "ContextBuilder",
    "ResponseGenerator",
  ] as SubsystemName[],

  PERFORMANCE_TARGETS_MS: {
    Conversation: 30,
    Reasoner: 50,
    Planner: 25,
    Scheduler: 10,
    Dispatcher: 30,
    Reflection: 15,
    AdaptiveRepair: 25,
    LearningEngine: 20,
    WorldModelV2: 20,
    HistoricalRetrieval: 40,
    ContextCollector: 15,
    TokenBudgetManager: 10,
    ContextBuilder: 25,
    ResponseGenerator: 0,
  } as Record<SubsystemName, number>,

  PROFILER_WINDOW_SIZE: 200,

  LOG_TAGS: {
    KERNEL: "[KERNEL]",
    REASONER: "[REASONER]",
    PLANNER: "[PLANNER]",
    SCHEDULER: "[SCHEDULER]",
    DISPATCHER: "[DISPATCHER]",
    REFLECTION: "[REFLECTION]",
    REPAIR: "[ADAPTIVE_REPAIR]",
    LEARNING: "[LEARNING_ENGINE]",
    WORLD_MODEL: "[WORLD_MODEL_V2]",
    DIAGNOSTICS: "[KERNEL_DIAGNOSTICS]",
  },
} as const;
