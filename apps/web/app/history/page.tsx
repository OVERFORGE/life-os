"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Code2, Smile, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

type HistoryItem = {
  _id: string;
  date: string;
  mental?: {
    mood?: number;
    energy?: number;
  };
  physical?: {
    gym?: boolean;
  };
  work?: {
    coded?: boolean;
  };
};

export default function HistoryPage() {
  const [logs, setLogs] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();


  useEffect(() => {
    fetch("/api/daily-log/list?limit=30")
      .then((res) => res.json())
      .then((data) => setLogs(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading history...</div>;
  }

  return (
    <div className="min-h-screen bg-[#161618] text-gray-100">
      <div className="w-full max-w-5xl px-6 md:px-12 pt-8 mx-auto space-y-6">
        <h1 className="text-3xl font-bold mb-4 tracking-tight">History</h1>

        {logs.length === 0 && (
          <div className="text-gray-400">No logs yet.</div>
        )}

        <div className="space-y-4">
          {logs.map((log) => (
            <div
              key={log._id}
              onClick={() => router.push(`/history/${log.date}`)}
              className="bg-[#1F2023] border border-[#2A2B2F] rounded-2xl p-5 flex justify-between items-center cursor-pointer hover:border-gray-500 transition-colors shadow-sm"
              >

              <div>
                <div className="font-bold text-lg">{log.date}</div>
                <div className="text-sm text-gray-400 flex gap-4 mt-2 items-center">
                  <div className="flex items-center gap-1.5 font-medium">
                      <Smile className="w-4 h-4 text-[#E8414A]" />
                      <span>{log.mental?.mood ?? "-"}/10</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                      <Zap className="w-4 h-4 text-[#E8414A]" />
                      <span>{log.mental?.energy ?? "-"}/10</span>
                  </div>
                </div>

              </div>

              <div className="flex gap-4 items-center bg-[#2A2B2F]/50 px-4 py-2 rounded-xl border border-[#2A2B2F]">
                  <div title="Gym">
                      {log.physical?.gym ? (
                      <Dumbbell className="w-5 h-5 text-[#E8414A]" />
                      ) : (
                      <Dumbbell className="w-5 h-5 text-gray-600" />
                      )}
                  </div>

                  <div title="Coded">
                      {log.work?.coded ? (
                      <Code2 className="w-5 h-5 text-[#E8414A]" />
                      ) : (
                      <Code2 className="w-5 h-5 text-gray-600" />
                      )}
                  </div>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
