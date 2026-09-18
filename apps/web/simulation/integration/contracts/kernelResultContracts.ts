export enum KernelFailureCategory {
  MODEL_NOT_FOUND = "MODEL_NOT_FOUND",
  TIMEOUT = "TIMEOUT",
  RATE_LIMIT = "RATE_LIMIT",
  INVALID_HANDLE_INPUT = "INVALID_HANDLE_INPUT",
  WORLDMODEL_EXCEPTION = "WORLDMODEL_EXCEPTION",
  CONTRACT_VALIDATION_FAILED = "CONTRACT_VALIDATION_FAILED",
  UNKNOWN = "UNKNOWN",
}

export interface KernelFailureDetail {
  category: KernelFailureCategory;
  retryable: boolean;
  provider?: string;
  providerModel?: string;
  providerRequestId?: string;
  latencyMs?: number;
  httpStatus?: number;
  message: string;
  rawError?: unknown;
}

export interface ExecutionOutcomeDTO {
  status: string;
  summary: string;
  rawResponseText?: string;
  rawDetails?: Record<string, unknown>;
}

export interface SimulationKernelResult {
  success: boolean;
  requestId?: string;
  runUid: string;
  tick: number;
  decisionId: string;
  intent: string;
  kernelVersion: string;
  pipelineVersion: string;
  executionTraceId?: string;
  executionDurationTicks?: number;
  worldSnapshot?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  executionOutcome: ExecutionOutcomeDTO;
  response: string;
  error: KernelFailureDetail | string | null;
}

