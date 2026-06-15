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
    <div className="min-h-screen bg-[#0f1115] text-gray-100">
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold mb-4">History</h1>

        {logs.length === 0 && (
          <div className="text-gray-400">No logs yet.</div>
        )}

        {logs.map((log) => (
          <div
            key={log._id}
            onClick={() => router.push(`/history/${log.date}`)}
            className="bg-[#161922] border border-[#232632] rounded-xl p-4 flex justify-between items-center cursor-pointer hover:border-gray-500 transition"
            >

            <div>
              <div className="font-medium">{log.date}</div>
              <div className="text-sm text-gray-400 flex gap-4 mt-1 items-center">
                <div className="flex items-center gap-1">
                    <Smile className="w-4 h-4" />
                    <span>{log.mental?.mood ?? "-"}/10</span>
                </div>

                <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4" />
                    <span>{log.mental?.energy ?? "-"}/10</span>
                </div>
                </div>

            </div>

            <div className="flex gap-3 items-center">
                <div title="Gym">
                    {log.physical?.gym ? (
                    <Dumbbell className="w-5 h-5 text-green-400" />
                    ) : (
                    <Dumbbell className="w-5 h-5 text-gray-600" />
                    )}
                </div>

                <div title="Coded">
                    {log.work?.coded ? (
                    <Code2 className="w-5 h-5 text-blue-400" />
                    ) : (
                    <Code2 className="w-5 h-5 text-gray-600" />
                    )}
                </div>
                </div>

          </div>
        ))}
      </div>
    </div>
  );
}
