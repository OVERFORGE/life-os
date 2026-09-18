export interface PersonaAnalyticsDTO {
  simulationCount: number;
  lastSimulationAt: string | null;
  averageOutcomeScore: number | null;
}

export interface PersonaValidationMetadataDTO {
  passed: boolean;
  checksum: string;
  validatedAt: string | null;
}

export interface SimulationPersonaDTO {
  id: string;
  personaUid: string; // Immutable PER_ARCHETYPE_XXXX

  code: string;
  name: string;
  description: string;
  archetype: string;

  templateId: string | null;
  templateVersion: string;
  isTemplate: boolean;

  identity: Record<string, string>;
  traits: Record<string, number>;
  initialState: Record<string, number>;
  lifestyle: Record<string, string>;
  motivation: Record<string, string>;

  capabilities: Record<string, boolean>;
  memoryProfile: Record<string, unknown>;
  supportedScenarioTypes: string[];

  metadata: Record<string, unknown>;
  behaviorPolicy: Record<string, unknown>;

  promptVersion: string;
  personaVersion: string;
  schemaVersion: string;
  isLatest: boolean;
  previousVersionId: string | null;

  analytics: PersonaAnalyticsDTO;
  validation: PersonaValidationMetadataDTO;

  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePersonaPayload {
  code: string;
  name: string;
  description?: string;
  archetype?: string;

  templateId?: string | null;
  templateVersion?: string;
  isTemplate?: boolean;

  identity?: Record<string, string>;
  traits?: Record<string, number>;
  initialState?: Record<string, number>;
  lifestyle?: Record<string, string>;
  motivation?: Record<string, string>;

  capabilities?: Record<string, boolean>;
  memoryProfile?: Record<string, unknown>;
  supportedScenarioTypes?: string[];

  metadata?: Record<string, unknown>;
  promptVersion?: string;
  personaVersion?: string;
  schemaVersion?: string;

  tags?: string[];
}

export interface UpdatePersonaPayload extends Partial<CreatePersonaPayload> {
  isActive?: boolean;
}

// ─── Runtime DTOs — Phase 1.3 ────────────────────────────────────────────────

export type RuntimeStatus =
  | "CREATED"
  | "INITIALIZING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface RuntimeStateDTO {
  status: RuntimeStatus;
  isRunning: boolean;
  isPaused: boolean;
  isFinished: boolean;

  tick: number; // Canonical monotonic counter
  currentDay: number;
  currentMinute: number;
  formattedTime: string; // Derived display string e.g. "08:00"
  formattedTimestamp: string; // Derived display string e.g. "Day 1 • 08:00"

  elapsedMinutes: number;
  elapsedTicks: number;
  simulationSpeed: number;
  remainingMinutes: number;
}

export interface RuntimeContextDTO {
  personaId: string;
  personaUid: string;
  personaCode: string;
  personaName: string;
  personaVersion: string;
  runUid: string;
  simulationSeed: number;
  startMinute: number;
  kernelVersion: string;
}

export interface RuntimeConfigurationDTO {
  startDay: number;
  startMinute: number;
  totalDays: number;
  maxTicks: number;
  tickIntervalMinutes: number;
  speedMultiplier: number;
  deterministicReplay: boolean;
  /**
   * Whether to persist runtime engine state checkpoints (SimulationRun document updates) on clock advance.
   * Note: This controls engine state persistence, distinct from step execution observability persistence via ExecutionRecorder.
   */
  persistSnapshots: boolean;
  enableLogging: boolean;
  futureFlags?: Record<string, unknown>;
}


export interface RuntimeMetricsDTO {
  elapsedTicks: number;
  elapsedMinutes: number;
  pauseCount: number;
  resumeCount: number;
  advanceCount: number;
}

export interface RuntimeLogEntryDTO {
  sequence: number;
  tick: number;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG" | "TICK" | "LIFECYCLE";
  message: string;
  action?: string;
  details?: string;
  timestamp?: string;
}

/** Canonical Runtime Snapshot — Pure, Reconstructable State */
export interface RuntimeSnapshot {
  status: RuntimeStatus;
  tick: number;
  seed: number;
  configuration: RuntimeConfigurationDTO;
  context: RuntimeContextDTO;
  metrics: RuntimeMetricsDTO;
  logs: RuntimeLogEntryDTO[];
  error: string | null;
}

export interface SimulationRunDTO {
  id: string;
  runUid: string;
  personaId: string;
  status: RuntimeStatus;
  startedAt: string | null;
  completedAt: string | null;
  seed: number;

  configuration: RuntimeConfigurationDTO;
  context: RuntimeContextDTO;
  /** Derived runtime state from canonical tick + status + configuration */
  state: RuntimeStateDTO;
  metrics: RuntimeMetricsDTO;
  logs: RuntimeLogEntryDTO[];

  error: string | null;
  kernelVersion: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StartSimulationPayload {
  personaId: string;
  seed?: number;
  configuration?: {
    totalDays?: number;
    tickIntervalMinutes?: number;
    startDay?: number;
    startMinute?: number;
    maxTicks?: number;
    speedMultiplier?: number;
    deterministicReplay?: boolean;
    persistSnapshots?: boolean;
    enableLogging?: boolean;
  };
}

export interface AdvanceSimulationPayload {
  ticks?: number;
}

export type { SimulationStepSnapshot } from "../execution/contracts/snapshotContracts";


export interface SimulationSnapshotDTO {
  id: string;
  runId: string;
  step: number;
  timestamp: string;
  state: Record<string, unknown>;
  hash: string;
  snapshotHash: string;
  kernelVersion: string;
}

export interface SimulationEventDTO {
  id: string;
  runId: string;
  step: number;
  eventType: "action_executed" | "state_changed" | "external_trigger" | "chaos_injected" | "assertion_evaluated";
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface SimulationScenarioDTO {
  id: string;
  key: string;
  name: string;
  description: string;
  initialConditions: Record<string, unknown>;
  scheduledEvents: Record<string, unknown>[];
  validationRules: Record<string, unknown>[];
  isTemplate: boolean;
}
