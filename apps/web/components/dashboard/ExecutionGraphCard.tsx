"use client";

import React from "react";
import Link from "next/link";
import { ExecutionGraphDTO } from "@life-os/execution-kernel";
import { CheckCircle, AlertCircle, GitBranch, ArrowRight } from "lucide-react";

interface ExecutionGraphCardProps {
  graph?: ExecutionGraphDTO | null;
}

export function ExecutionGraphCard({ graph }: ExecutionGraphCardProps) {
  if (!graph) return null;

  const { graphVersion, nodeCount, edgeCount, blockageRatio, readyTasks, blockedTasks, criticalPathTasks, parallelExecutionWaves } = graph;

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-[#2A2B2F]/50 pb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            EXECUTION GRAPH TOPOLOGY
          </div>
          <div className="text-base font-bold text-gray-100 mt-0.5">
            Directed Acyclic Graph (v{graphVersion})
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-[#161618] border border-[#2A2B2F] px-3 py-1 rounded-lg">
            <span>Nodes: {nodeCount}</span>
            <span>•</span>
            <span>Edges: {edgeCount}</span>
          </div>
          <Link
            href="/tasks"
            className="text-xs text-[#E8414A] hover:underline flex items-center gap-1 font-medium"
          >
            <span>View Tasks</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
        <Link
          href="/tasks"
          className="bg-[#161618] border border-[#2A2B2F] hover:border-emerald-500/50 hover:bg-[#1a1b1e] transition-all p-4 rounded-xl space-y-1 block cursor-pointer"
        >
          <div className="text-gray-400 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-400" /> Ready Tasks
          </div>
          <div className="text-xl font-bold text-gray-100">{readyTasks?.length || 0}</div>
        </Link>

        <Link
          href="/tasks"
          className="bg-[#161618] border border-[#2A2B2F] hover:border-[#E8414A]/50 hover:bg-[#1a1b1e] transition-all p-4 rounded-xl space-y-1 block cursor-pointer"
        >
          <div className="text-gray-400 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-[#E8414A]" /> Blocked Tasks
          </div>
          <div className="text-xl font-bold text-[#E8414A]">{blockedTasks?.length || 0}</div>
        </Link>

        <Link
          href="/tasks"
          className="bg-[#161618] border border-[#2A2B2F] hover:border-gray-500 hover:bg-[#1a1b1e] transition-all p-4 rounded-xl space-y-1 block cursor-pointer"
        >
          <div className="text-gray-400 flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-gray-300" /> Critical Path
          </div>
          <div className="text-xl font-bold text-gray-100">{criticalPathTasks?.length || 0}</div>
        </Link>
      </div>

      {parallelExecutionWaves && parallelExecutionWaves.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#2A2B2F]">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            PARALLEL EXECUTION WAVES
          </div>
          <div className="flex flex-wrap gap-2">
            {parallelExecutionWaves.map((wave, idx) => (
              <div key={idx} className="bg-[#161618] border border-[#2A2B2F] px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300">
                Wave {idx + 1}: <span className="font-bold text-white">{wave.length} Node(s)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
