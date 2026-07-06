"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, CheckCircle2, AlertCircle } from "lucide-react";

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        // Mark as read
        if (data.notifications?.some((n: any) => !n.read)) {
          fetch("/api/notifications", { method: "PUT" });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center px-6 md:px-12 pt-8 pb-6 border-b border-[#2A2B2F]">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1F2023] border border-[#2A2B2F] hover:bg-[#2A2B2F] transition-colors shadow-sm mr-4 shrink-0"
        >
          <ArrowLeft size={18} className="text-gray-300" />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {loading ? (
          <div className="flex flex-col items-center mt-20">
            <div className="w-8 h-8 rounded-full border-2 border-[#E8414A] border-t-transparent animate-spin" />
            <p className="text-gray-400 mt-4 text-sm font-semibold">Loading logs...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center mt-10 bg-[#1F2023] p-8 md:p-12 rounded-3xl border border-[#2A2B2F]">
            <CheckCircle2 size={48} className="text-gray-300 mb-6 opacity-30" />
            <h2 className="text-xl font-bold text-gray-100 mb-2">All caught up!</h2>
            <p className="text-sm font-semibold text-gray-500 text-center max-w-xs leading-relaxed">
              You have no new notifications.
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {notifications.map((n) => {
              const isUnread = !n.read;
              return (
                <div
                  key={n._id}
                  onClick={() => router.push("/chat")}
                  className={`flex items-start p-5 rounded-3xl border transition-all cursor-pointer shadow-sm ${
                    isUnread
                      ? "bg-[#E8414A]/5 border-[#E8414A]/25 hover:bg-[#E8414A]/10"
                      : "bg-[#1F2023] border-[#2A2B2F] hover:border-gray-500/30"
                  }`}
                >
                  <div className="mr-4 mt-0.5">
                    {n.type === "alert" ? (
                      <AlertCircle size={20} className="text-[#E8414A]" />
                    ) : (
                      <Bell size={20} className={isUnread ? "text-[#E8414A]" : "text-gray-500"} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3
                      className={`font-bold text-base mb-1 ${
                        isUnread ? "text-gray-100" : "text-gray-300"
                      }`}
                    >
                      {n.title}
                    </h3>
                    <p className="text-sm font-medium text-gray-500 leading-relaxed mb-3">
                      {n.body}
                    </p>
                    <div className="text-[10px] font-bold text-gray-600 tracking-widest uppercase">
                      {new Date(n.createdAt).toLocaleDateString()} •{" "}
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
