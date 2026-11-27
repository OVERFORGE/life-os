"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  RefreshCw,
  Search,
  Radio,
} from "lucide-react";

interface TraceSummary {
  traceId: string;
  parentTraceId?: string;
  requestId: string;
  executionId: string;
  conversationId?: string;
  userId: string;
  surface: string;
  status: string;
  routingStrategy?: string;
  terminationReason?: string;
  startedAt: string;
  durationMs: number;
  userMessagePreview?: string;
  finalResponsePreview?: string;
  langsmithRunId?: string;
  langsmithUrl?: string;
  stepCount?: number;
  llmCallCount?: number;
}

interface TraceStep {
  stepId: string;
  layer: string;
  component: string;
  operation: string;
  status: string;
  startedAtMs: number;
  durationMs: number;
  inputs?: any;
  decision?: any;
  outputs?: any;
  error?: string;
}

interface TraceDetailResponse {
  trace: TraceSummary & {
    steps: TraceStep[];
    llmCalls: any[];
    kernelActionIds: string[];
    outboxEventIds: string[];
    finalFrontendPayload?: any;
  };
  correlated: {
    workspace: any;
    audits: any[];
    executionEvents: any[];
    evidence: any[];
    outboxEvents: any[];
    linkedWorkerTraces: any[];
  };
}

type InspectorTab =
  | "io"
  | "llm"
  | "kernel_outbox"
  | "frontend"
  | "workers";

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  AWAITING_CONFIRMATION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  AWAITING_CLARIFICATION: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  FAILED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RUNNING: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

export default function AdminObservabilityPage() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<InspectorTab>("io");

  const [surfaceFilter, setSurfaceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveFollow, setLiveFollow] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTraces = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (surfaceFilter !== "ALL") params.set("surface", surfaceFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      params.set("limit", "40");

      const res = await fetch(`/api/admin/observability/traces?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || `Failed to load traces (${res.status})`);
        return;
      }
      const data = await res.json();
      const list: TraceSummary[] = data.traces || [];
      setTraces(list);
      setErrorMsg(null);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].traceId);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error");
    } finally {
      setLoadingList(false);
    }
  }, [surfaceFilter, statusFilter, searchQuery, selectedId]);

  const loadDetail = useCallback(async (traceId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/observability/traces/${encodeURIComponent(traceId)}`);
      if (!res.ok) {
        setDetail(null);
        return;
      }
      const data: TraceDetailResponse = await res.json();
      setDetail(data);
      setActiveStepIdx(0);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!liveFollow) return;
    const es = new EventSource("/api/admin/observability/stream");
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.type === "traces_update" && Array.isArray(parsed.traces) && parsed.traces.length > 0) {
          void loadTraces();
          if (parsed.traces[0]?.traceId && liveFollow) {
            setSelectedId(parsed.traces[0].traceId);
          }
        }
      } catch (_) {}
    };
    return () => {
      es.close();
    };
  }, [liveFollow, loadTraces]);

  const steps = useMemo(() => detail?.trace?.steps || [], [detail]);
  const currentStep = steps[activeStepIdx] || null;

  return (
    <div className="p-6 space-y-5 text-stone-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400">
            <Activity className="w-4 h-4" />
            Live & Post-Run Execution Debugger
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            LifeOS Observability Inspector
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Inspect LangGraph transitions, LangChain prompts, Kernel audits, Outbox events, and delivered frontend payloads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLiveFollow((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
              liveFollow
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-stone-900 border-stone-700 text-stone-400"
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {liveFollow ? "Live Follow: ON" : "Live Follow: OFF"}
          </button>
          <button
            type="button"
            onClick={() => void loadTraces()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-stone-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by traceId, requestId, executionId, or prompt..."
            className="w-full pl-9 pr-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <select
          value={surfaceFilter}
          onChange={(e) => setSurfaceFilter(e.target.value)}
          className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-200"
        >
          <option value="ALL">All Surfaces</option>
          <option value="aven_chat">Aven Chat</option>
          <option value="voice">Voice</option>
          <option value="desktop_hud">Desktop HUD</option>
          <option value="kernel_dispatch">Kernel Dispatch</option>
          <option value="inngest_worker">Inngest Worker</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-200"
        >
          <option value="ALL">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="AWAITING_CONFIRMATION">Awaiting Confirmation</option>
          <option value="AWAITING_CLARIFICATION">Awaiting Clarification</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs font-mono text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Main 3-Pane Debugger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Interaction Feed */}
        <div className="lg:col-span-4 bg-stone-950 border border-stone-800 rounded-xl overflow-hidden flex flex-col max-h-[75vh]">
          <div className="px-3 py-2.5 border-b border-stone-800 text-[11px] font-mono uppercase tracking-wider text-stone-400 flex items-center justify-between">
            <span>Recent Interactions ({traces.length})</span>
            {loadingList && <span className="text-amber-400">Loading...</span>}
          </div>
          <div className="overflow-y-auto divide-y divide-stone-900">
            {traces.length === 0 ? (
              <div className="p-6 text-xs text-stone-500 text-center">
                No traces recorded yet. Interact with Aven or dispatch a kernel action to see live traces.
              </div>
            ) : (
              traces.map((t) => {
                const isSelected = t.traceId === selectedId;
                return (
                  <button
                    key={t.traceId}
                    type="button"
                    onClick={() => setSelectedId(t.traceId)}
                    className={`w-full text-left p-3 transition hover:bg-stone-900/70 ${
                      isSelected ? "bg-stone-900 border-l-2 border-amber-400" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-stone-400 uppercase">
                        {t.surface} · {t.routingStrategy || "DIRECT"}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          STATUS_BADGE[t.status] || "bg-stone-800 text-stone-300 border-stone-700"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="text-xs text-stone-100 font-medium mt-1 truncate">
                      {t.userMessagePreview || t.terminationReason || t.executionId}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-stone-500">
                      <span>{t.durationMs}ms · {t.stepCount ?? 0} steps</span>
                      <span>{new Date(t.startedAt).toLocaleTimeString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center + Right: Step Timeline & Component Inspector */}
        <div className="lg:col-span-8 space-y-4">
          {!detail ? (
            <div className="bg-stone-950 border border-stone-800 rounded-xl p-10 text-center text-xs text-stone-500">
              {loadingDetail ? "Loading trace details..." : "Select a trace from the left feed to inspect step-by-step execution."}
            </div>
          ) : (
            <>
              {/* Trace Summary Banner */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-mono text-stone-400">
                    Trace <span className="text-stone-200">{detail.trace.traceId}</span> · Exec{" "}
                    <span className="text-stone-200">{detail.trace.executionId}</span>
                  </div>
                  <div className="text-sm font-semibold text-stone-100">
                    {detail.trace.userMessagePreview || detail.trace.terminationReason || "Execution Run"}
                  </div>
                  <div className="text-[11px] font-mono text-stone-400">
                    Route: {detail.trace.routingStrategy || "—"} · Outcome:{" "}
                    {detail.trace.terminationReason || detail.trace.status} · Duration:{" "}
                    {detail.trace.durationMs}ms
                  </div>
                </div>
                {detail.trace.langsmithUrl && (
                  <a
                    href={detail.trace.langsmithUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono hover:bg-amber-500/25"
                  >
                    Open in LangSmith <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Stepper Controls & Timeline */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-stone-400">
                    Execution Steps ({steps.length})
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={steps.length === 0 || activeStepIdx === 0}
                      onClick={() => setActiveStepIdx(0)}
                      className="p-1.5 rounded bg-stone-900 border border-stone-800 disabled:opacity-30"
                      title="First step"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={steps.length === 0 || activeStepIdx === 0}
                      onClick={() => setActiveStepIdx((i) => Math.max(0, i - 1))}
                      className="p-1.5 rounded bg-stone-900 border border-stone-800 disabled:opacity-30"
                      title="Previous step"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-xs font-mono text-stone-300">
                      {steps.length > 0 ? `${activeStepIdx + 1} / ${steps.length}` : "0 / 0"}
                    </span>
                    <button
                      type="button"
                      disabled={steps.length === 0 || activeStepIdx >= steps.length - 1}
                      onClick={() => setActiveStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                      className="p-1.5 rounded bg-stone-900 border border-stone-800 disabled:opacity-30"
                      title="Next step"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={steps.length === 0 || activeStepIdx >= steps.length - 1}
                      onClick={() => setActiveStepIdx(Math.max(0, steps.length - 1))}
                      className="p-1.5 rounded bg-stone-900 border border-stone-800 disabled:opacity-30"
                      title="Last step"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {steps.map((s, idx) => (
                    <button
                      key={s.stepId || idx}
                      type="button"
                      onClick={() => {
                        setActiveStepIdx(idx);
                        setActiveTab("io");
                      }}
                      className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition ${
                        idx === activeStepIdx
                          ? "bg-amber-500/15 border-amber-500/50 text-amber-200"
                          : "bg-stone-900/70 border-stone-800 text-stone-300 hover:border-stone-700"
                      }`}
                    >
                      <div className="text-[10px] font-mono uppercase opacity-75">{s.layer}</div>
                      <div className="text-xs font-mono font-semibold">{s.operation}</div>
                      <div className="text-[10px] font-mono opacity-60">{s.durationMs}ms</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabbed Inspector Drawer */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl overflow-hidden">
                <div className="flex flex-wrap border-b border-stone-800 bg-stone-900/40">
                  {(
                    [
                      ["io", "Step Input / Decision / Output"],
                      ["llm", `LLM Calls (${detail.trace.llmCalls?.length || 0})`],
                      [
                        "kernel_outbox",
                        `Kernel & Outbox (${detail.correlated.audits.length + detail.correlated.outboxEvents.length})`,
                      ],
                      ["frontend", "Final Frontend Payload"],
                      [
                        "workers",
                        `Linked Workers (${detail.correlated.linkedWorkerTraces.length})`,
                      ],
                    ] as [InspectorTab, string][]
                  ).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setActiveTab(tabId)}
                      className={`px-4 py-2.5 text-xs font-mono border-b-2 transition ${
                        activeTab === tabId
                          ? "border-amber-400 text-amber-300 bg-stone-900/60"
                          : "border-transparent text-stone-400 hover:text-stone-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-4 max-h-[42vh] overflow-y-auto text-xs font-mono space-y-3">
                  {activeTab === "io" && (
                    currentStep ? (
                      <div className="space-y-3">
                        <div className="text-stone-300">
                          <span className="text-stone-500">Component:</span> {currentStep.component} ·{" "}
                          <span className="text-stone-500">Operation:</span> {currentStep.operation} ·{" "}
                          <span className="text-stone-500">Status:</span> {currentStep.status}
                        </div>
                        {currentStep.error && (
                          <pre className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-200 overflow-x-auto">
                            {currentStep.error}
                          </pre>
                        )}
                        <div>
                          <div className="text-[10px] uppercase text-stone-500 mb-1">Input</div>
                          <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                            {JSON.stringify(currentStep.inputs ?? null, null, 2)}
                          </pre>
                        </div>
                        {currentStep.decision !== undefined && (
                          <div>
                            <div className="text-[10px] uppercase text-stone-500 mb-1">Decision</div>
                            <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                              {JSON.stringify(currentStep.decision, null, 2)}
                            </pre>
                          </div>
                        )}
                        <div>
                          <div className="text-[10px] uppercase text-stone-500 mb-1">Output</div>
                          <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                            {JSON.stringify(currentStep.outputs ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-500">No steps recorded for this trace.</div>
                    )
                  )}

                  {activeTab === "llm" && (
                    <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                      {JSON.stringify(detail.trace.llmCalls || [], null, 2)}
                    </pre>
                  )}

                  {activeTab === "kernel_outbox" && (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase text-stone-500 mb-1">
                          Action Audit Records ({detail.correlated.audits.length})
                        </div>
                        <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                          {JSON.stringify(detail.correlated.audits, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-stone-500 mb-1">
                          Outbox Events ({detail.correlated.outboxEvents.length})
                        </div>
                        <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                          {JSON.stringify(detail.correlated.outboxEvents, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-stone-500 mb-1">
                          Execution Workspace & Evidence
                        </div>
                        <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                          {JSON.stringify(
                            {
                              workspace: detail.correlated.workspace,
                              evidence: detail.correlated.evidence,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  )}

                  {activeTab === "frontend" && (
                    <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                      {JSON.stringify(
                        {
                          finalResponsePreview: detail.trace.finalResponsePreview,
                          finalFrontendPayload: detail.trace.finalFrontendPayload,
                        },
                        null,
                        2
                      )}
                    </pre>
                  )}

                  {activeTab === "workers" && (
                    <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 overflow-x-auto">
                      {JSON.stringify(detail.correlated.linkedWorkerTraces || [], null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
