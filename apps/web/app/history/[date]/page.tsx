"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MentalReadOnlyCard } from "@/features/daily-log/read-only/MentalReadOnlyCard";
import { SleepReadOnlyCard } from "@/features/daily-log/read-only/SleepReadOnlyCard";
import { PhysicalReadOnlyCard } from "@/features/daily-log/read-only/PhysicalReadOnlyCard";
import { WorkReadOnlyCard } from "@/features/daily-log/read-only/WorkReadOnlyCard";
import { HabitsReadOnlyCard } from "@/features/daily-log/read-only/HabitsReadOnlyCard";
import { PlanningReadOnlyCard } from "@/features/daily-log/read-only/PlanningReadOnlyCard";
import { ReflectionReadOnlyCard } from "@/features/daily-log/read-only/ReflectionReadOnlyCard";


export default function HistoryDayPage() {
  const { date } = useParams();
  const router = useRouter();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/daily-log/by-date?date=${date}`)
      .then((res) => res.json())
      .then((data) => setLog(data))
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  if (!log || log.error) {
    return (
      <div className="p-6 text-gray-400">
        Not found.
        <button
          className="block mt-4 underline"
          onClick={() => router.push("/history")}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100">
      <div className="w-full max-w-5xl px-6 md:px-12 pt-8 mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{date}</h1>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] rounded-lg text-sm text-gray-300 font-medium transition-colors"
            onClick={() => router.push("/history")}
          >
            ← Back to History
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
          <MentalReadOnlyCard data={log} />
          <SleepReadOnlyCard data={log} />
          <PhysicalReadOnlyCard data={log} />
          <WorkReadOnlyCard data={log} />
          <HabitsReadOnlyCard data={log} />
          <PlanningReadOnlyCard data={log} />
          <ReflectionReadOnlyCard data={log} />
        </div>
      </div>
    </div>
  );
}
