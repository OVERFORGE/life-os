import { KernelRuntime } from "./kernel/KernelRuntime";
import { HandleInput } from "./kernel/KernelEngine";
import { getActiveDate, isPastHour, parseLocalToUTC } from "./automation/timeUtils";
import { EventBus } from "./events/EventBus";
import { KernelEvent } from "./events/Event";
import { ExecutionContext } from "./runtime/ExecutionContext";
import { Brain } from "./brain/Brain";
import { generateId } from "./shared/ids";
import { KERNEL_CONFIG } from "./shared/KernelConfig";
import { PerformanceTimer } from "./shared/PerformanceTimer";
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

import { ConversationManager, LoadedConversationState } from "./kernel/ConversationManager";
import { ConversationSemantics, ConversationIntent, SemanticEntityReference } from "./kernel/ConversationSemantics";
import { EntityResolver, ConcreteEntity } from "./kernel/EntityResolver";
import { ConfidenceGate, MUTATION_CONFIDENCE_THRESHOLD, GateResult } from "./kernel/ConfidenceGate";
import { ShortTermMemoryResolver, ResolvedContext } from "./kernel/ShortTermMemoryResolver";
import { ContextCollector, CollectedContext, CONTEXT_LIMITS } from "./kernel/ContextCollector";
import { ContextBuilder, PromptPayload } from "./kernel/ContextBuilder";
import { ConversationSummarizer, SUMMARIZER_CONFIG } from "./kernel/ConversationSummarizer";
import { TokenBudgetManager, DEFAULT_TOKEN_BUDGETS, BudgetAllocation } from "./kernel/TokenBudgetManager";
import {
  HistoricalRetrievalEngine,
  resolveDateRange,
  HistoricalQuery,
  HistoricalRecord,
  HistoricalSearchResult,
  TimeWindow,
  IHistoricalProvider,
} from "./kernel/HistoricalRetrievalEngine";
import {
  ExecutionGraph,
  ExecutionNode,
  ExecutionEdge,
  ExecutionPressure,
  ExecutionGraphSnapshot,
  BlockedNodeInfo,
  DependencyType,
} from "./kernel/ExecutionGraph";
import {
  AdaptiveRepairEngine,
  RepairTrigger,
  RepairOpType,
  RepairOperation,
  RepairPlan,
  RepairDiagnostics,
  AdaptiveRepairPlanningResult,
  RepairParams,
  ProjectedNodeState,
} from "./kernel/AdaptiveRepairEngine";
import { ExecutionGraphApplier, TransactionResult } from "./kernel/ExecutionGraphApplier";
import { RepairHistory, RepairHistoryRecord } from "./kernel/RepairHistory";
import { ExecutionStateValidator } from "./kernel/ExecutionStateValidator";
import { RepairOperationExecutorRegistry, IRepairOperationExecutor } from "./kernel/RepairOperationExecutors";
import { ExecutionGraphReplayEngine } from "./kernel/ExecutionGraphReplayEngine";
import { GraphVersion, createGraphVersion } from "./kernel/GraphVersion";

// Phase 9 Distributed Execution Infrastructure Exports
import { DeviceIdentity, DeviceMetadata, SyncEventMetadata, DeviceType } from "./sync/DeviceIdentity";
import { SyncStateMachine, SyncState, SyncStateListener } from "./sync/SyncStateMachine";
import { SyncJournal, JournalEntry } from "./sync/SyncJournal";
import { OfflineOperationQueue, QueuedOperation } from "./sync/OfflineOperationQueue";
import { ConflictResolver, ConflictResolutionAction, ConflictResolutionResult } from "./sync/ConflictResolver";
import { ReplicationManager, EventBatch } from "./sync/ReplicationManager";
import { KernelCheckpoint } from "./sync/KernelCheckpoint";
import { CheckpointManager } from "./sync/CheckpointManager";
import { SessionRecoveryEngine, RecoveredSessionState } from "./sync/SessionRecoveryEngine";
import { SyncDiagnostics, SyncDiagnosticsMetrics } from "./sync/SyncDiagnostics";
import { SyncEngine, SyncProcessResult } from "./sync/SyncEngine";

// Phase 10 Learning Engine Exports
import { BehaviorPattern, PatternType, ConfidenceTier } from "./learning/BehaviorPattern";
import { BehaviorPatternLibrary } from "./learning/BehaviorPatternLibrary";
import { ConfidenceEngine, ConfidenceAssessment } from "./learning/ConfidenceEngine";
import { BehaviorEvolution } from "./learning/BehaviorEvolution";
import { BehavioralProfile, UserBehavioralProfile } from "./learning/BehaviorProfile";
import { LearningSignal, LearningSignalType } from "./learning/LearningSignal";
import { LearningHistory, LearningRecord } from "./learning/LearningHistory";
import { MemoryScoringEngine, MemoryScore, MemoryScoreFactors, ScorableMemoryItem } from "./learning/MemoryScoringEngine";
import { HabitLearningEngine } from "./learning/HabitLearningEngine";
import { AdaptiveContextEngine, RankedAdaptiveContextItem } from "./learning/AdaptiveContextEngine";
import { LearningEngine, LearningEngineOutput } from "./learning/LearningEngine";

// Phase 11 World Model V2 Exports
import { LifeStateEngine, LifeState, LifeStateResult, LifeStateInput } from "./worldv2/LifeStateEngine";
import { GoalPressureEngineV2, GoalPressureResult } from "./worldv2/GoalPressureEngineV2";
import { ProjectStateEngine, ProjectStateResult, ProjectStatus, RiskLevel } from "./worldv2/ProjectStateEngine";
import { RelationshipContextEngine, RelationshipSummary } from "./worldv2/RelationshipContextEngine";
import { WorldTrendEngine, WorldTrend, MetricTrend } from "./worldv2/WorldTrendEngine";
import { WorldPredictionEngineV2, WorldPrediction } from "./worldv2/WorldPredictionEngineV2";
import { WorldSnapshotV2, ExecutionGraphSummary } from "./worldv2/WorldSnapshotV2";
import { WorldModelV2, ComputeWorldModelInput } from "./worldv2/WorldModelV2";

// Phase 12 Kernel Diagnostics & Observability Exports
import {
  SubsystemName,
  SubsystemDiagnostic,
  TraceSpan,
  HealthStatus,
  HealthSummary,
  PerformanceMetricSummary,
  PerformanceSummary,
  MetricSummary,
  ResourceUsage,
  DiagnosticSnapshot,
} from "./diagnostics/DiagnosticSnapshot";
import { PerformanceBudgetManager, DEFAULT_PERFORMANCE_BUDGETS } from "./diagnostics/PerformanceBudgetManager";
import { KernelProfiler } from "./diagnostics/KernelProfiler";
import { KernelMetricsRegistry } from "./diagnostics/KernelMetricsRegistry";
import { KernelHealthEngine, HealthEvaluationInput } from "./diagnostics/KernelHealthEngine";
import { KernelTraceEngine } from "./diagnostics/KernelTraceEngine";
import { KernelAuditEngine, AuditQuestionInput, AuditReport } from "./diagnostics/KernelAuditEngine";
import { KernelDiagnosticsEngine } from "./diagnostics/KernelDiagnosticsEngine";

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
  ConversationManager,
  EntityResolver,
  ConfidenceGate,
  MUTATION_CONFIDENCE_THRESHOLD,
  ShortTermMemoryResolver,
  ContextCollector,
  ContextBuilder,
  CONTEXT_LIMITS,
  ConversationSummarizer,
  SUMMARIZER_CONFIG,
  TokenBudgetManager,
  DEFAULT_TOKEN_BUDGETS,
  HistoricalRetrievalEngine,
  resolveDateRange,
  ExecutionGraph,
  AdaptiveRepairEngine,
  ExecutionGraphApplier,
  RepairHistory,
  ExecutionStateValidator,
  RepairOperationExecutorRegistry,
  ExecutionGraphReplayEngine,
  createGraphVersion,
  DeviceIdentity,
  SyncStateMachine,
  SyncJournal,
  OfflineOperationQueue,
  ConflictResolver,
  ReplicationManager,
  CheckpointManager,
  SessionRecoveryEngine,
  SyncDiagnostics,
  SyncEngine,
  BehaviorPatternLibrary,
  ConfidenceEngine,
  BehaviorEvolution,
  BehavioralProfile,
  LearningHistory,
  MemoryScoringEngine,
  HabitLearningEngine,
  AdaptiveContextEngine,
  LearningEngine,
  LifeStateEngine,
  GoalPressureEngineV2,
  ProjectStateEngine,
  RelationshipContextEngine,
  WorldTrendEngine,
  WorldPredictionEngineV2,
  WorldModelV2,
  PerformanceBudgetManager,
  DEFAULT_PERFORMANCE_BUDGETS,
  KernelProfiler,
  KernelMetricsRegistry,
  KernelHealthEngine,
  KernelTraceEngine,
  KernelAuditEngine,
  KernelDiagnosticsEngine,
  KERNEL_CONFIG,
  PerformanceTimer,
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
  LoadedConversationState,
  ConversationSemantics,
  ConversationIntent,
  SemanticEntityReference,
  ConcreteEntity,
  GateResult,
  ResolvedContext,
  CollectedContext,
  PromptPayload,
  BudgetAllocation,
  HistoricalQuery,
  HistoricalRecord,
  HistoricalSearchResult,
  TimeWindow,
  IHistoricalProvider,
  ExecutionNode,
  ExecutionEdge,
  ExecutionPressure,
  ExecutionGraphSnapshot,
  BlockedNodeInfo,
  DependencyType,
  RepairTrigger,
  RepairOpType,
  RepairOperation,
  RepairPlan,
  RepairDiagnostics,
  AdaptiveRepairPlanningResult,
  RepairParams,
  ProjectedNodeState,
  TransactionResult,
  RepairHistoryRecord,
  IRepairOperationExecutor,
  GraphVersion,
  DeviceMetadata,
  SyncEventMetadata,
  DeviceType,
  SyncState,
  SyncStateListener,
  JournalEntry,
  QueuedOperation,
  ConflictResolutionAction,
  ConflictResolutionResult,
  EventBatch,
  KernelCheckpoint,
  RecoveredSessionState,
  SyncDiagnosticsMetrics,
  SyncProcessResult,
  BehaviorPattern,
  PatternType,
  ConfidenceTier,
  ConfidenceAssessment,
  UserBehavioralProfile,
  LearningSignal,
  LearningSignalType,
  LearningRecord,
  MemoryScore,
  MemoryScoreFactors,
  ScorableMemoryItem,
  RankedAdaptiveContextItem,
  LearningEngineOutput,
  LifeState,
  LifeStateResult,
  LifeStateInput,
  GoalPressureResult,
  ProjectStateResult,
  ProjectStatus,
  RiskLevel,
  RelationshipSummary,
  WorldTrend,
  MetricTrend,
  WorldPrediction,
  WorldSnapshotV2,
  ExecutionGraphSummary,
  ComputeWorldModelInput,
  SubsystemName,
  SubsystemDiagnostic,
  TraceSpan,
  HealthStatus,
  HealthSummary,
  PerformanceMetricSummary,
  PerformanceSummary,
  MetricSummary,
  ResourceUsage,
  DiagnosticSnapshot,
  HealthEvaluationInput,
  AuditQuestionInput,
  AuditReport,
};
