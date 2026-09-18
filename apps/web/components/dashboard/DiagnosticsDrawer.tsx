"use client";

import React, { useState } from "react";
import { DiagnosticsDTO, SettingsDTO } from "@life-os/execution-kernel";
import { ChevronDown, ChevronUp } from "lucide-react";

interface DiagnosticsDrawerProps {
  diagnostics?: DiagnosticsDTO | null;
  settings?: SettingsDTO | null;
}

export function DiagnosticsDrawer({ diagnostics, settings }: DiagnosticsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-6 shadow-sm space-y-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          KERNEL DIAGNOSTICS & TELEMETRY INSPECTOR
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{isOpen ? "Collapse Inspector" : "Expand Inspector"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="pt-4 border-t border-[#2A2B2F] space-y-4 text-xs font-mono">
          {settings && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Kernel Version</div>
                <div className="text-gray-100 font-bold">{settings.kernelVersion}</div>
              </div>
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Telemetry Version</div>
                <div className="text-gray-100 font-bold">{settings.telemetryVersion}</div>
              </div>
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Calibration Package</div>
                <div className="text-gray-100 font-bold truncate">{settings.calibrationPackageId}</div>
              </div>
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Diagnostics State</div>
                <div className="text-emerald-400 font-bold">SEALED</div>
              </div>
            </div>
          )}

          {diagnostics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Health Status</div>
                <div className="text-emerald-400 font-bold">{diagnostics.health.status} ({diagnostics.health.score}/100)</div>
              </div>
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Total Requests</div>
                <div className="text-gray-100 font-bold">{diagnostics.metrics.totalRequests}</div>
              </div>
              <div className="bg-[#161618] border border-[#2A2B2F] p-3 rounded-xl">
                <div className="text-gray-500 text-[10px] uppercase">Avg Stability</div>
                <div className="text-gray-100 font-bold">{diagnostics.metrics.avgStabilityScore}/100</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
