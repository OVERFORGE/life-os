"use client";

import React, { useEffect, useState, useCallback } from "react";

import { X, Loader2, Cpu, CheckCircle2, XCircle, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { ExecutionInspectionDTO } from "@/simulation/execution/services/executionInspectionService";

interface ExecutionInspectorDrawerProps {
  runUid: string | null;
  stepNumber: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export interface ArtifactDescriptor {
  key: string;
  label: string;
  order: number;
  textColor?: string;
  formatText?: (payload: Record<string, unknown>) => string;
}

/**
 * Artifact Registry — Maps artifact keys to display labels, ordering, and formatters.
 * Unregistered / future artifact kinds fall back automatically to humanized labels.
 */
export const ARTIFACT_REGISTRY: Record<string, ArtifactDescriptor> = {
  runtimeSnapshot: {
    key: "runtimeSnapshot",
    label: "1. Runtime Snapshot",
    order: 10,
    textColor: "text-gray-200",
  },
  prompt: {
    key: "prompt",
    label: "3. Prompt Document",
    order: 30,
    textColor: "text-gray-300",
    formatText: (p) => (p?.serializedPrompt as string) ?? (p?.systemPrompt as string) ?? JSON.stringify(p, null, 2),
  },
  llmResponse: {
    key: "llmResponse",
    label: "4. LLM Raw Response",
    order: 40,
    textColor: "text-emerald-400",
  },
  decision: {
    key: "decision",
    label: "5. DecisionDTO",
    order: 50,
    textColor: "text-gray-200",
  },
  virtualRequest: {
    key: "virtualRequest",
    label: "Virtual Request",
    order: 55,
    textColor: "text-blue-300",
  },
  handleInput: {
    key: "handleInput",
    label: "6. HandleInput",
    order: 60,
    textColor: "text-amber-300",
  },
  kernelResult: {
    key: "kernelResult",
    label: "7. Kernel Result",
    order: 70,
    textColor: "text-gray-200",
  },
  diagnostics: {
    key: "diagnostics",
    label: "8. Diagnostics",
    order: 80,
    textColor: "text-[#E8414A]",
  },
  worldBefore: {
    key: "worldBefore",
    label: "9. World Before",
    order: 90,
    textColor: "text-gray-200",
  },
  worldAfter: {
    key: "worldAfter",
    label: "10. World After",
    order: 100,
    textColor: "text-gray-200",
  },
  diff: {
    key: "diff",
    label: "11. Diff Viewer",
    order: 110,
    textColor: "text-indigo-300",
  },
};

export function ExecutionInspectorDrawer({
  runUid,
  stepNumber,
  isOpen,
  onClose,
}: ExecutionInspectorDrawerProps) {
  const [data, setData] = useState<ExecutionInspectionDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>("prompt");
  const [openStages, setOpenStages] = useState<boolean>(true);

  const fetchInspectionData = useCallback(async () => {
    if (!runUid || stepNumber === null) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/simulation/${runUid}/snapshot/${stepNumber}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch inspection payload (${res.status})`);
      }
      const result = await res.json();
      setData(result.inspection);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Inspection load error");
    } finally {
      setIsLoading(false);
    }
  }, [runUid, stepNumber]);

  useEffect(() => {
    if (isOpen && runUid && stepNumber !== null) {
      fetchInspectionData();
    }
  }, [isOpen, runUid, stepNumber, fetchInspectionData]);

  if (!isOpen) return null;

  const snapshot = data?.snapshot;
  const trace = data?.trace;
  const artifacts = data?.artifacts;

  // Artifact-driven dynamic tabs construction
  const dynamicArtifactTabs = Object.keys(artifacts ?? {})
    .filter((key) => {
      const payload = artifacts?.[key as keyof typeof artifacts];
      return payload !== null && payload !== undefined;
    })
    .map((key) => {
      const descriptor = ARTIFACT_REGISTRY[key] ?? {
        key,
        label: key.replace(/([A-Z])/g, " $1").trim(),
        order: 500,
        textColor: "text-gray-200",
      };
      return {
        id: key,
        label: descriptor.label,
        order: descriptor.order,
        descriptor,
        payload: artifacts![key as keyof typeof artifacts] as Record<string, unknown>,
      };
    })
    .sort((a, b) => a.order - b.order);

  const allTabs = [
    ...dynamicArtifactTabs,
    {
      id: "rawJson",
      label: "12. Raw JSON",
      order: 999,
      descriptor: {
        key: "rawJson",
        label: "Complete ExecutionInspectionDTO",
        order: 999,
        textColor: "text-gray-300",
      },
      payload: data as unknown as Record<string, unknown>,
    },
  ];

  // Default active tab to prompt or first available tab
  const currentActiveTab = allTabs.find((t) => t.id === activeTabId) ?? allTabs[0];

  // Failure details derivation for header banner
  const isFailed = snapshot?.kernelSuccess === false || snapshot?.executionStatus === "FAILED";
  const kernelErrorObj = artifacts?.kernelResult?.error as Record<string, unknown> | null | undefined;
  const failureStage = trace?.stages?.find((stg) => stg.name === "KERNEL_INVOCATION" && stg.status === "FAILED");
  const failureCategory =
    snapshot?.failureCategory ??
    (typeof kernelErrorObj === "object" ? kernelErrorObj?.category : undefined) ??
    (failureStage?.failure as any)?.category ??
    "KERNEL_FAILURE";

  const failureMessage =
    (typeof kernelErrorObj === "object" ? kernelErrorObj?.message : typeof kernelErrorObj === "string" ? kernelErrorObj : undefined) ??
    (failureStage?.failure as any)?.message ??
    failureStage?.notes ??
    (artifacts?.kernelResult?.executionOutcome as any)?.summary ??
    "Kernel execution failed";

  const isRetryable = (typeof kernelErrorObj === "object" ? kernelErrorObj?.retryable : undefined) ?? (failureStage?.failure as any)?.retryable ?? false;
  const provider = (typeof kernelErrorObj === "object" ? kernelErrorObj?.provider : undefined) ?? snapshot?.metadata?.llmProvider;
  const providerModel = (typeof kernelErrorObj === "object" ? kernelErrorObj?.providerModel : undefined) ?? snapshot?.metadata?.llmModel;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-full bg-[#0F0F10] border-l border-[#27272A] flex flex-col font-sans shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#27272A] flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E8414A]/10 border border-[#E8414A]/30 flex items-center justify-center text-[#E8414A]">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Execution Inspector</span>
                {stepNumber !== null && (
                  <span className="text-xs font-mono text-[#E8414A] bg-[#E8414A]/10 px-2 py-0.5 rounded">
                    Step #{stepNumber}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-[#71717A]">
                {runUid} • {snapshot?.timestampVirtual ?? "Loading..."}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center gap-2 text-[#71717A]">
            <Loader2 className="w-5 h-5 animate-spin text-[#E8414A]" />
            <span className="text-xs font-mono">Reconstructing step artifacts...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6">
            <div className="p-4 rounded-xl border border-red-900/40 bg-red-950/20 text-xs font-mono text-red-400">
              {error}
            </div>
          </div>
        )}

        {/* Inspection View Body */}
        {!isLoading && data && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Summary Strip */}
            <div className="px-6 py-3 bg-[#161618]/60 border-b border-[#27272A] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-mono text-[#71717A] uppercase block">Snapshot ID</span>
                <span className="font-mono text-gray-200 truncate block text-[11px]">{snapshot?.snapshotId}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#71717A] uppercase block">Trace ID</span>
                <span className="font-mono text-gray-200 truncate block text-[11px]">{snapshot?.traceId}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#71717A] uppercase block">Intent</span>
                <span className="font-mono text-[#E8414A] font-bold block text-[11px]">{snapshot?.decisionIntent}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#71717A] uppercase block">Outcome</span>
                <span className={`font-mono font-bold text-[11px] ${snapshot?.kernelSuccess ? "text-emerald-400" : "text-red-400"}`}>
                  {snapshot?.kernelSuccess ? "SUCCESS" : `FAILED (${failureCategory})`}
                </span>
              </div>
            </div>

            {/* High-visibility Failure Alert Banner */}
            {isFailed && (
              <div className="mx-6 mt-3 mb-1 p-3.5 rounded-xl border border-red-800/40 bg-red-950/30 flex flex-col gap-1.5 font-mono text-xs shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-[12px]">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>KERNEL FAILURE: [{String(failureCategory)}]</span>
                  </div>
                  {isRetryable && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-semibold uppercase">
                      RETRYABLE
                    </span>
                  )}
                </div>
                <div className="text-red-200 text-[11px] pl-6 leading-relaxed break-words">
                  {String(failureMessage)}
                </div>
                {(provider || providerModel) && (
                  <div className="text-[10px] text-red-400/70 pl-6 flex items-center gap-3 font-mono">
                    {provider && <span>Provider: {String(provider)}</span>}
                    {providerModel && <span>Model: {String(providerModel)}</span>}
                  </div>
                )}
              </div>
            )}


            {/* Execution Stages Waterfall (Collapsible) */}
            <div className="border-b border-[#27272A] bg-[#0F0F10]">
              <button
                onClick={() => setOpenStages((prev) => !prev)}
                className="w-full px-6 py-2.5 flex items-center justify-between text-xs text-[#71717A] hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  {openStages ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span className="font-mono uppercase text-[10px] font-bold tracking-wider">
                    Execution Trace Waterfall ({trace?.stages.length ?? 0} stages • {trace?.summary.totalDurationMs ?? 0}ms)
                  </span>
                </div>
              </button>

              {openStages && trace && (
                <div className="px-6 pb-3 space-y-1 max-h-40 overflow-y-auto">
                  {trace.stages.map((stg) => (
                    <div
                      key={stg.order}
                      className="flex items-center justify-between text-[11px] font-mono py-1 px-2.5 rounded bg-[#161618] border border-[#27272A]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[#52525B] font-semibold w-4">{stg.order}.</span>
                        <span className="text-gray-200 font-medium truncate">{stg.name}</span>
                        {stg.notes && <span className="text-[#52525B] truncate">({stg.notes})</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[#71717A] text-[10px]">{stg.durationMs}ms</span>
                        {stg.status === "SUCCESS" ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Artifact-Driven Dynamic Tab Bar */}
            <div className="px-6 border-b border-[#27272A] bg-[#161618]/40 flex items-center gap-1 overflow-x-auto scrollbar-none py-2">
              {allTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap ${
                    currentActiveTab?.id === tab.id
                      ? "bg-[#E8414A] text-white font-bold"
                      : "text-[#71717A] hover:text-white hover:bg-[#27272A]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Dynamic Artifact Payload Display */}
            <div className="flex-1 p-6 overflow-y-auto bg-[#0F0F10]">
              {currentActiveTab && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#E8414A]">
                      {currentActiveTab.label}
                    </span>
                    {currentActiveTab.descriptor.key === "prompt" && (
                      <span className="text-[10px] font-mono text-[#71717A]">
                        Hash: {(currentActiveTab.payload as any)?.promptHash}
                      </span>
                    )}
                  </div>
                  <pre
                    className={`p-4 rounded-xl border border-[#27272A] bg-[#161618] text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed ${
                      currentActiveTab.descriptor.textColor ?? "text-gray-200"
                    }`}
                  >
                    {currentActiveTab.descriptor.formatText
                      ? currentActiveTab.descriptor.formatText(currentActiveTab.payload)
                      : JSON.stringify(currentActiveTab.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
