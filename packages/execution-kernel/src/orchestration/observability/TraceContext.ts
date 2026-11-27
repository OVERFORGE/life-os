import { AsyncLocalStorage } from "node:async_hooks";
import { generateId } from "../../shared/ids";
import { sanitizeTracePayload } from "./TracePrivacy";

export type TraceSurface =
  | "aven_chat"
  | "voice"
  | "desktop_hud"
  | "kernel_dispatch"
  | "direct_api"
  | "inngest_worker";

export type TraceLayer =
  | "ingress"
  | "context"
  | "langgraph"
  | "llm"
  | "routing"
  | "kernel"
  | "outbox"
  | "synthesis"
  | "delivery";

export interface TraceStepRecord {
  stepId: string;
  layer: TraceLayer;
  component: string;
  operation: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  startedAtMs: number;
  durationMs: number;
  inputs?: any;
  decision?: any;
  outputs?: any;
  error?: string;
}

export interface TraceLlmCallRecord {
  callId: string;
  model: string;
  provider: string;
  promptPreview?: any;
  responsePreview?: any;
  startedAtMs: number;
  durationMs: number;
  error?: string;
}

export interface ActiveTraceContext {
  traceId: string;
  parentTraceId?: string;
  requestId: string;
  executionId: string;
  conversationId?: string;
  userId: string;
  surface: TraceSurface;
  startedAtMs: number;
  langsmithRunId?: string;
  langsmithUrl?: string;
  steps: TraceStepRecord[];
  llmCalls: TraceLlmCallRecord[];
  kernelActionIds: string[];
  outboxEventIds: string[];
}

const traceStorage = new AsyncLocalStorage<ActiveTraceContext>();

export function getActiveTraceContext(): ActiveTraceContext | undefined {
  return traceStorage.getStore();
}

export function createTraceContext(params: {
  traceId?: string;
  parentTraceId?: string;
  requestId: string;
  executionId: string;
  conversationId?: string;
  userId: string;
  surface: TraceSurface;
  langsmithRunId?: string;
  langsmithUrl?: string;
}): ActiveTraceContext {
  return {
    traceId: params.traceId || generateId("trc"),
    parentTraceId: params.parentTraceId,
    requestId: params.requestId,
    executionId: params.executionId,
    conversationId: params.conversationId,
    userId: params.userId,
    surface: params.surface,
    startedAtMs: Date.now(),
    langsmithRunId: params.langsmithRunId,
    langsmithUrl: params.langsmithUrl,
    steps: [],
    llmCalls: [],
    kernelActionIds: [],
    outboxEventIds: [],
  };
}

export function runWithTraceContext<T>(
  ctx: ActiveTraceContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return traceStorage.run(ctx, fn);
}

export function recordTraceStep(step: Omit<TraceStepRecord, "stepId"> & { stepId?: string }): void {
  const ctx = traceStorage.getStore();
  if (!ctx) return;
  ctx.steps.push({
    stepId: step.stepId || generateId("stp"),
    layer: step.layer,
    component: step.component,
    operation: step.operation,
    status: step.status,
    startedAtMs: step.startedAtMs,
    durationMs: Math.max(0, step.durationMs),
    inputs: step.inputs !== undefined ? sanitizeTracePayload(step.inputs) : undefined,
    decision: step.decision !== undefined ? sanitizeTracePayload(step.decision) : undefined,
    outputs: step.outputs !== undefined ? sanitizeTracePayload(step.outputs) : undefined,
    error: step.error ? String(sanitizeTracePayload(step.error)) : undefined,
  });
}

export function recordTraceLlmCall(call: Omit<TraceLlmCallRecord, "callId"> & { callId?: string }): void {
  const ctx = traceStorage.getStore();
  if (!ctx) return;
  ctx.llmCalls.push({
    callId: call.callId || generateId("llm"),
    model: call.model,
    provider: call.provider,
    promptPreview: call.promptPreview !== undefined ? sanitizeTracePayload(call.promptPreview) : undefined,
    responsePreview: call.responsePreview !== undefined ? sanitizeTracePayload(call.responsePreview) : undefined,
    startedAtMs: call.startedAtMs,
    durationMs: Math.max(0, call.durationMs),
    error: call.error ? String(sanitizeTracePayload(call.error)) : undefined,
  });
}

export function linkTraceAction(actionId?: string): void {
  if (!actionId) return;
  const ctx = traceStorage.getStore();
  if (!ctx) return;
  if (!ctx.kernelActionIds.includes(actionId)) {
    ctx.kernelActionIds.push(actionId);
  }
}

export function linkTraceOutboxEvent(eventId?: string): void {
  if (!eventId) return;
  const ctx = traceStorage.getStore();
  if (!ctx) return;
  if (!ctx.outboxEventIds.includes(eventId)) {
    ctx.outboxEventIds.push(eventId);
  }
}
