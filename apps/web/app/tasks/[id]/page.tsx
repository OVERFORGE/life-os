"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TaskInspector } from "@/features/tasks/components/TaskInspector";

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  return (
    <div className="max-w-3xl mx-auto w-full animate-in fade-in duration-300">
      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-100 mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Tasks
      </button>

      <div className="bg-[#1F2023] border border-[#2A2B2F] rounded-xl p-8 shadow-sm">
        <TaskInspector taskId={id} />
      </div>
    </div>
  );
}
