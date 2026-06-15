"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications || []);
        // Automatically mark as read
        if (data.notifications?.some((n: any) => !n.read)) {
          fetch("/api/notifications", { method: "PUT" });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <Bell className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-gray-400 text-sm">System alerts and daily reminders</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20 bg-[#161922] rounded-2xl border border-[#232632]">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-200">All caught up!</h2>
            <p className="text-gray-400">You have no new notifications.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((n) => (
              <Link
                key={n._id}
                href="/dashboard/assistant"
                className={`flex gap-4 p-5 rounded-2xl border transition-colors cursor-pointer hover:border-amber-500/50 ${
                  !n.read
                    ? "bg-[#1c202a] border-amber-500/30"
                    : "bg-[#161922] border-[#232632]"
                }`}
              >
                <div className="mt-1">
                  {n.type === "alert" ? (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Bell className="w-5 h-5 text-amber-500" />
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold ${!n.read ? "text-white" : "text-gray-300"}`}>
                    {n.title}
                  </h3>
                  <p className="text-gray-400 mt-1 text-sm leading-relaxed">
                    {n.body}
                  </p>
                  <p className="text-xs text-gray-500 mt-3 font-medium">
                    {new Date(n.createdAt).toLocaleDateString()} at{" "}
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
