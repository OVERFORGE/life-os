import { RunTree } from "langsmith";
import { sanitizeTracePayload } from "./TracePrivacy";

export function isLangSmithEnabled(): boolean {
  const flag =
    process.env.LANGSMITH_TRACING === "true" ||
    process.env.LANGCHAIN_TRACING_V2 === "true";
  const key = (process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY || "").trim();
  return flag && key.length > 0;
}

export function getLangSmithProject(): string {
  return (
    process.env.LANGSMITH_PROJECT ||
    process.env.LANGCHAIN_PROJECT ||
    "life-os"
  ).trim();
}

export function syncLangSmithEnv(): void {
  if (process.env.LANGSMITH_TRACING === "true" && !process.env.LANGCHAIN_TRACING_V2) {
    process.env.LANGCHAIN_TRACING_V2 = "true";
  }
  if (process.env.LANGSMITH_API_KEY && !process.env.LANGCHAIN_API_KEY) {
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
  }
  if (process.env.LANGSMITH_PROJECT && !process.env.LANGCHAIN_PROJECT) {
    process.env.LANGCHAIN_PROJECT = process.env.LANGSMITH_PROJECT;
  }
  if (process.env.LANGSMITH_ENDPOINT && !process.env.LANGCHAIN_ENDPOINT) {
    process.env.LANGCHAIN_ENDPOINT = process.env.LANGSMITH_ENDPOINT;
  }
}

export function buildLangSmithRunUrl(runId: string): string {
  const project = encodeURIComponent(getLangSmithProject());
  return `https://smith.langchain.com/o/default/projects/p/${project}/r/${encodeURIComponent(runId)}`;
}

/**
 * Starts a fail-open LangSmith RunTree for non-graph direct callers
 * (e.g. /api/kernel/dispatch, linked Outbox/Inngest worker runs).
 */
export async function startDirectLangSmithRun(params: {
  name: string;
  runType?: "chain" | "tool" | "llm";
  inputs?: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
}): Promise<{ runId?: string; url?: string; finish: (outputs?: Record<string, any>, error?: string) => Promise<void> }> {
  if (!isLangSmithEnabled()) {
    return {
      finish: async () => {},
    };
  }

  syncLangSmithEnv();
  try {
    const run = new RunTree({
      name: params.name,
      run_type: params.runType || "chain",
      project_name: getLangSmithProject(),
      inputs: sanitizeTracePayload(params.inputs || {}),
      extra: { metadata: sanitizeTracePayload(params.metadata || {}) },
      tags: params.tags,
    });
    await run.postRun();
    const runId = run.id;
    const url = buildLangSmithRunUrl(runId);

    return {
      runId,
      url,
      finish: async (outputs?: Record<string, any>, error?: string) => {
        try {
          await run.end({
            outputs: outputs ? sanitizeTracePayload(outputs) : undefined,
            error: error ? String(sanitizeTracePayload(error)) : undefined,
          });
          await run.patchRun();
        } catch (_) {
          // Fail-open: LangSmith network errors must never impact LifeOS
        }
      },
    };
  } catch (_) {
    return {
      finish: async () => {},
    };
  }
}
