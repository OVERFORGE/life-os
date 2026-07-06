"use client";

import { Clock, Zap, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export function TaskList({ items }: { items: any[] }) {
  const router = useRouter();

  return (
    <div className="flex flex-col space-y-3">
      {items.map((task) => {
        return (
          <div
            key={task._id}
            onClick={() => router.push(`/tasks/${task._id}`)}
            className="group flex items-center justify-between p-4 bg-[#1F2023] border border-[#2A2B2F] rounded-xl cursor-pointer transition-all duration-200 hover:border-[#3A3C42] shadow-sm"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              
              {/* Checkbox */}
              <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${
                task.status === "completed"
                  ? "bg-[#E8414A] border-[#E8414A]"
                  : "border-gray-500 group-hover:border-gray-300 bg-transparent"
              }`}>
                {task.status === "completed" && <Check size={12} className="text-white" />}
              </div>
              
              {/* Title */}
              <span className={`text-base font-medium truncate ${
                task.status === "completed" ? "text-[#9ca3af] line-through" : "text-gray-100"
              }`}>
                {task.title}
              </span>
            </div>
            
            {/* Metadata */}
            <div className="flex items-center gap-4 shrink-0">
              
              {/* Priority Badge */}
              {task.priority === "high" && (
                <div className="flex items-center gap-1 text-[#E8414A] text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]" /> High
                </div>
              )}
              
              {/* Energy Cost */}
              {task.metadata?.energyCost && (
                <div className="flex items-center gap-1 text-xs text-[#E8414A]">
                  <Zap size={12} /> {task.metadata.energyCost}
                </div>
              )}
              
              {/* Due Time */}
              {task.dueTime && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock size={12} /> {task.dueTime}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
