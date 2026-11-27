import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import { recordTraceLlmCall, recordTraceStep } from "./TraceContext";

interface PendingSpan {
  name: string;
  startedAtMs: number;
  inputs?: any;
  model?: string;
}

/**
 * LifeOSTraceCallbackHandler
 *
 * Bridges LangGraph node transitions, LangChain LLM calls, and Kernel tools
 * directly into the active TraceContext with automatic sanitization.
 */
export class LifeOSTraceCallbackHandler extends BaseCallbackHandler {
  name = "LifeOSTraceCallbackHandler";
  private spans = new Map<string, PendingSpan>();

  async handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    _runType?: string,
    name?: string
  ) {
    const label = name || (metadata?.langgraph_node as string) || chain?.id?.[chain.id.length - 1] || "chain";
    this.spans.set(runId, {
      name: String(label),
      startedAtMs: Date.now(),
      inputs: { keys: Object.keys(inputs || {}) },
    });
  }

  async handleChainEnd(outputs: Record<string, unknown>, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    recordTraceStep({
      layer: "langgraph",
      component: "LifeOSOrchestrationGraph",
      operation: span.name,
      status: "COMPLETED",
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
      inputs: span.inputs,
      outputs: outputs ? { keys: Object.keys(outputs), routeTarget: (outputs as any).routeTarget } : undefined,
    });
  }

  async handleChainError(err: any, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    recordTraceStep({
      layer: "langgraph",
      component: "LifeOSOrchestrationGraph",
      operation: span.name,
      status: "FAILED",
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
      inputs: span.inputs,
      error: err?.message || String(err),
    });
  }

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>
  ) {
    const model = String((extraParams as any)?.invocation_params?.model || llm?.id?.[llm.id.length - 1] || "lifeos_llm");
    this.spans.set(runId, {
      name: model,
      model,
      startedAtMs: Date.now(),
      inputs: prompts?.[0] || "",
    });
  }

  async handleLLMEnd(output: LLMResult, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    const text = output?.generations?.[0]?.[0]?.text || "";
    recordTraceLlmCall({
      model: span.model || span.name,
      provider: "lifeos_groq_gemini",
      promptPreview: span.inputs,
      responsePreview: text,
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
    });
  }

  async handleLLMError(err: any, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    recordTraceLlmCall({
      model: span.model || span.name,
      provider: "lifeos_groq_gemini",
      promptPreview: span.inputs,
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
      error: err?.message || String(err),
    });
  }

  async handleToolStart(tool: Serialized, input: string, runId: string) {
    const toolName = tool?.id?.[tool.id.length - 1] || "kernel_tool";
    this.spans.set(runId, {
      name: String(toolName),
      startedAtMs: Date.now(),
      inputs: input,
    });
  }

  async handleToolEnd(output: string, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    recordTraceStep({
      layer: "kernel",
      component: "LangChainToolBridge",
      operation: span.name,
      status: "COMPLETED",
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
      inputs: span.inputs,
      outputs: output,
    });
  }

  async handleToolError(err: any, runId: string) {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    recordTraceStep({
      layer: "kernel",
      component: "LangChainToolBridge",
      operation: span.name,
      status: "FAILED",
      startedAtMs: span.startedAtMs,
      durationMs: Date.now() - span.startedAtMs,
      inputs: span.inputs,
      error: err?.message || String(err),
    });
  }
}
