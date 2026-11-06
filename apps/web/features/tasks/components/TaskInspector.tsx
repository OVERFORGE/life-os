import { useState, useEffect } from "react";
import { Check, Clock, Zap, Target, Trash2, Calendar, GripVertical } from "lucide-react";

export function TaskInspector({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  const fetchTask = async () => {
    setLoading(true);
    if (taskId === "new") {
      setTask({ title: "", description: "", status: "pending", priority: "medium" });
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      const data = await res.json();
      if (data.ok) setTask(data.task);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleComplete = async () => {
    const action = task.status === "completed" ? "uncomplete" : "complete";
    setTask({ ...task, status: action === "complete" ? "completed" : "pending" });
    await fetch(`/api/tasks/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, action })
    });
  };

  const saveTask = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`/api/tasks/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          title: task.title,
          description: task.description,
        })
      });
      if (res.ok) {
        setSaveStatus("Saved ✅");
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (err) {
      console.error("Failed to save task updates:", err);
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async () => {
    if (typeof window !== "undefined" && window.confirm("Are you sure you want to delete this task?")) {
      await fetch(`/api/tasks/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId })
      });
      window.location.href = "/tasks";
    }
  };

  if (loading) return <div className="text-sm text-[#9ca3af] animate-pulse">Loading task context...</div>;
  if (!task) return <div className="text-sm text-[#ef4444]">Task not found</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header Actions */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2A2B2F]">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleComplete}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              task.status === "completed" 
                ? "bg-[#E8414A] text-white shadow-sm" 
                : "bg-[#2A2B2F] text-gray-300 hover:text-white hover:bg-[#3A3C42]"
            }`}
          >
            <Check size={14} />
            {task.status === "completed" ? "Completed" : "Mark Complete"}
          </button>

          <button
            onClick={saveTask}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#1F2023] hover:bg-[#2A2B2F] border border-[#2A2B2F] text-gray-200 transition-colors"
          >
            {saving ? "Saving..." : saveStatus || "Save Changes"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={deleteTask}
            title="Delete Task"
            className="p-2 rounded-lg text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Title & Description */}
      <div className="space-y-4">
        <input 
          value={task.title}
          onChange={(e) => setTask({...task, title: e.target.value})}
          className="w-full bg-transparent text-2xl font-bold text-gray-100 focus:outline-none placeholder:text-[#9ca3af]"
          placeholder="Task title..."
        />
        <textarea
          value={task.description || ""}
          onChange={(e) => setTask({...task, description: e.target.value})}
          placeholder="Add notes, context, or links here..."
          className="w-full h-32 bg-transparent text-sm text-gray-400 resize-none focus:outline-none placeholder:text-gray-600 transition-opacity"
        />
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <Calendar size={10} /> Date
          </span>
          <div className="text-sm font-medium text-gray-200">{task.dueDate}</div>
        </div>

        <div className="p-3 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <Clock size={10} /> Time
          </span>
          <div className="text-sm font-medium text-gray-200">{task.dueTime || "Anytime"}</div>
        </div>

        <div className="p-3 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <Zap size={10} /> Energy Cost
          </span>
          <div className="text-sm font-medium text-gray-200">{task.metadata?.energyCost || "None"}</div>
        </div>

        <div className="p-3 rounded-xl bg-[#2A2B2F]/50 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
            <Target size={10} /> Goal
          </span>
          <div className="text-sm font-medium text-gray-200">{task.goalId ? "Linked Goal" : "Unlinked"}</div>
        </div>
      </div>
      
    </div>
  );
}
