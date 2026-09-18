"use client";

import React from "react";
import {
  AdminPageHeader,
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  ADMIN_METRICS_MOCK,
} from "@/components/admin";
import {
  Play,
  Database,
  Cpu,
  CheckCircle2,
  GitCompare,
  Activity,
  Terminal,
  Server,
  Layers,
} from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6 font-sans">
      <AdminPageHeader
        title="Admin Console & System Overview"
        description="Internal engineering platform for monitoring, validating, and testing the deterministic LifeOS Execution Kernel."
        badge="SYSTEM ONLINE"
      />

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* 1. Simulation Runs */}
        <AdminCard>
          <div className="flex items-center justify-between text-[#71717A] mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Simulations
            </span>
            <Play className="w-4 h-4 text-[#E8414A]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {ADMIN_METRICS_MOCK.SIMULATION_RUNS_TOTAL}
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#A1A1AA]">
            <span>Active: {ADMIN_METRICS_MOCK.SIMULATION_RUNS_ACTIVE}</span>
            <span className="text-[#E8414A]">100% Deterministic</span>
          </div>
        </AdminCard>

        {/* 2. Snapshots */}
        <AdminCard>
          <div className="flex items-center justify-between text-[#71717A] mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Snapshots
            </span>
            <Database className="w-4 h-4 text-[#E8414A]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {ADMIN_METRICS_MOCK.SNAPSHOTS_RECORDED}
          </div>
          <div className="text-[10px] font-mono text-[#A1A1AA]">
            State Hash Integrity Verified
          </div>
        </AdminCard>

        {/* 3. Kernel Version */}
        <AdminCard>
          <div className="flex items-center justify-between text-[#71717A] mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Kernel Spec
            </span>
            <Cpu className="w-4 h-4 text-[#E8414A]" />
          </div>
          <div className="text-lg font-mono font-bold text-white mb-1 truncate">
            {ADMIN_METRICS_MOCK.KERNEL_VERSION}
          </div>
          <div className="text-[10px] font-mono text-[#A1A1AA]">
            Build: 2026.08-v2
          </div>
        </AdminCard>

        {/* 4. Validation Status */}
        <AdminCard>
          <div className="flex items-center justify-between text-[#71717A] mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Validation
            </span>
            <CheckCircle2 className="w-4 h-4 text-[#E8414A]" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mb-1">
            {ADMIN_METRICS_MOCK.VALIDATION_STATUS}
          </div>
          <div className="text-[10px] font-mono text-[#A1A1AA]">
            Determinism: {ADMIN_METRICS_MOCK.DETERMINISM_SCORE}
          </div>
        </AdminCard>

        {/* 5. Regression Status */}
        <AdminCard>
          <div className="flex items-center justify-between text-[#71717A] mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              Regression
            </span>
            <GitCompare className="w-4 h-4 text-[#E8414A]" />
          </div>
          <div className="text-sm font-mono font-bold text-white mb-1 mt-1">
            {ADMIN_METRICS_MOCK.REGRESSION_SUITES}
          </div>
          <div className="text-[10px] font-mono text-[#A1A1AA]">
            0 Breaking Changes
          </div>
        </AdminCard>
      </div>

      {/* Secondary Information & Telemetry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest System Activity Log */}
        <AdminCard className="lg:col-span-2">
          <AdminCardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E8414A]" />
              <AdminCardTitle>Latest System Activity Log</AdminCardTitle>
            </div>
            <span className="text-[10px] font-mono text-[#71717A]">
              STREAM ID: 0x9FA0
            </span>
          </AdminCardHeader>

          <div className="space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded bg-[#18181B] border border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" />
                <span className="text-[#A1A1AA]">SYS_INIT</span>
                <span className="text-white">Admin Console foundation v1.1 initialized</span>
              </div>
              <span className="text-[10px] text-[#71717A]">01:51:40 UTC</span>
            </div>

            <div className="p-2.5 rounded bg-[#18181B] border border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" />
                <span className="text-[#A1A1AA]">DB_SCHEMA</span>
                <span className="text-white">Simulation models registered in Mongoose schema registry</span>
              </div>
              <span className="text-[10px] text-[#71717A]">01:51:38 UTC</span>
            </div>

            <div className="p-2.5 rounded bg-[#18181B] border border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[#A1A1AA]">KERNEL_CHK</span>
                <span className="text-white">Deterministic state engine ready on standby</span>
              </div>
              <span className="text-[10px] text-[#71717A]">01:51:30 UTC</span>
            </div>

            <div className="p-2.5 rounded bg-[#18181B] border border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[#A1A1AA]">ROUTE_MOUNT</span>
                <span className="text-white">Isolated admin layout mounted at /admin</span>
              </div>
              <span className="text-[10px] text-[#71717A]">01:50:00 UTC</span>
            </div>
          </div>
        </AdminCard>

        {/* Infrastructure & Engine Status */}
        <div className="space-y-4">
          <AdminCard>
            <AdminCardHeader>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#E8414A]" />
                <AdminCardTitle>Lab Infrastructure</AdminCardTitle>
              </div>
            </AdminCardHeader>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#1E1E22]">
                <span className="text-[#A1A1AA]">Environment</span>
                <span className="text-white font-semibold">{ADMIN_METRICS_MOCK.ENVIRONMENT}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1E1E22]">
                <span className="text-[#A1A1AA]">Routing Scope</span>
                <span className="text-[#E8414A]">Isolated (/admin)</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1E1E22]">
                <span className="text-[#A1A1AA]">Persistence</span>
                <span className="text-white">Mongoose Base Schemas</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#A1A1AA]">Module Architecture</span>
                <span className="text-[#E8414A]">apps/web/simulation/</span>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#E8414A]" />
                <AdminCardTitle>Kernel Lab Modules</AdminCardTitle>
              </div>
            </AdminCardHeader>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between text-white bg-[#18181B] px-2.5 py-1 rounded border border-[#27272A]">
                <span>Simulation Lab</span>
                <span className="text-[#E8414A] font-bold">READY</span>
              </div>
              <div className="flex items-center justify-between text-[#71717A] bg-[#18181B]/50 px-2.5 py-1 rounded">
                <span>Personas Engine</span>
                <span className="text-[#71717A]">COMING SOON</span>
              </div>
              <div className="flex items-center justify-between text-[#71717A] bg-[#18181B]/50 px-2.5 py-1 rounded">
                <span>Determinism Validation</span>
                <span className="text-[#71717A]">COMING SOON</span>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
