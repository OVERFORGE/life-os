"use client";

import { useState, useEffect } from "react";
import { Plus, ListFilter, SortDesc } from "lucide-react";
import { TaskList } from "@/features/tasks/components/TaskList";

import { useRouter } from "next/navigation";

export default function TasksPage() {
  const [tasks, setTasks] = useState({ today: [], overdue: [], upcoming: [], all: [] });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tasks/list?filter=all");
      const data = await res.json();
      if (data.ok) {
        setTasks({
          today: data.today || [],
          overdue: data.overdue || [],
          upcoming: data.upcoming || [],
          all: data.all || []
        });
      }
    } catch (error) {
      console.error("Failed to fetch tasks", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 max-w-5xl mx-auto w-full px-6 md:px-12 pt-8">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-100">Tasks</h1>
          <p className="text-sm text-gray-400 mt-1">Manage and execute your daily objectives.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-lg text-sm text-gray-300 hover:bg-[#2A2B2F] transition-colors">
            <ListFilter size={16} /> Filter
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-[#1F2023] border border-[#2A2B2F] rounded-lg text-sm text-gray-300 hover:bg-[#2A2B2F] transition-colors">
            <SortDesc size={16} /> Sort
          </button>
          <button 
            onClick={() => router.push("/tasks/new")}
            className="flex items-center gap-2 px-4 py-2 bg-[#E8414A] hover:bg-[#D62C35] text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Main Workspace Area - Scrollable */}
      <div className="flex-1 space-y-10 pb-10">
        
        {loading ? (
          <div className="text-sm text-gray-400">Loading tasks...</div>
        ) : (
          <>
            {/* Overdue Section */}
            {tasks.overdue.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-[#ef4444] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                  Overdue
                </h2>
                <TaskList items={tasks.overdue} />
              </section>
            )}

            {/* Today Section */}
            <section>
              <h2 className="text-sm font-bold text-gray-100 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E8414A]" />
                Today
              </h2>
              {tasks.today.length > 0 ? (
                <TaskList items={tasks.today} />
              ) : (
                <div className="p-8 rounded-xl border border-dashed border-[#2A2B2F] bg-[#1F2023]/50 flex flex-col items-center justify-center text-center">
                  <p className="text-sm font-medium text-gray-300">No tasks scheduled for today.</p>
                  <p className="text-xs text-[#9ca3af] mt-1">Take a break or pull tasks from your backlog.</p>
                </div>
              )}
            </section>

            {/* Upcoming Section */}
            {tasks.upcoming.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  Upcoming
                </h2>
                <TaskList items={tasks.upcoming} />
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}
