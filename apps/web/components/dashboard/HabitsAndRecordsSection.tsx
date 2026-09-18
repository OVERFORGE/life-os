"use client";

import React, { useEffect, useState } from "react";
import { SummaryGrid } from "@/features/dashboard/components/SummaryGrid";
import { StreakGrid } from "@/features/dashboard/components/StreakGrid";
import { PersonalRecords } from "@/features/dashboard/components/PersonalRecords";

export function HabitsAndRecordsSection() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/daily-log/list?limit=30")
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setLogs(data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* 7-Day Metrics Grid */}
      <SummaryGrid logs={logs} />

      {/* Streaks Grid */}
      <StreakGrid logs={logs} />

      {/* Personal Records Grid */}
      <PersonalRecords logs={logs} />
    </div>
  );
}
