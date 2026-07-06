"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Command, ArrowRight, CheckCircle, Target } from "lucide-react";
import { useSelectionStore } from "@/lib/store/selectionStore";

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div className="bg-[var(--color-bg-workspace)]/90 backdrop-blur-2xl w-full max-w-2xl rounded-[var(--radius-xl)] shadow-[var(--shadow-overlay)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-[var(--color-border-default)]">
        
        {/* Input Area */}
        <div className="flex items-center px-4 py-4 border-b border-[var(--color-alpha-white10)]">
          <Search size={20} className="text-[var(--color-text-primary)] mr-3 opacity-70" />
          <input
            autoFocus
            placeholder="Search LifeOS or type a command..."
            className="flex-1 bg-transparent text-[var(--text-lg)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          <div className="flex items-center gap-1 text-[var(--text-xs)] text-[var(--color-text-muted)] bg-[var(--color-alpha-white5)] px-2 py-1 rounded">
            <Command size={12} />
            <span>K</span>
          </div>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          
          <div className="px-3 py-2 text-[10px] font-[var(--font-bold)] uppercase tracking-[var(--tracking-widest)] text-[var(--color-text-muted)] opacity-70">
            Tasks
          </div>
          
          <button 
            onClick={() => handleAction(() => router.push('/tasks?create=true'))}
            className="w-full flex items-center justify-between px-3 py-3 rounded-[var(--radius-lg)] hover:bg-[var(--color-alpha-white5)] group transition-all duration-200"
          >
            <div className="flex items-center gap-3 text-[var(--color-text-primary)]">
              <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-alpha-white5)] flex items-center justify-center shadow-sm">
                <CheckCircle size={16} className="text-[var(--color-brand-primary)]" />
              </div>
              <span className="font-[var(--font-medium)] text-[var(--text-sm)]">Create Task</span>
            </div>
            <span className="text-[var(--text-xs)] text-[var(--color-text-muted)]">Action</span>
          </button>

          <button 
            onClick={() => handleAction(() => router.push('/tasks'))}
            className="w-full flex items-center justify-between px-3 py-3 rounded-[var(--radius-lg)] hover:bg-[var(--color-alpha-white5)] group transition-all duration-200"
          >
            <div className="flex items-center gap-3 text-[var(--color-text-primary)]">
              <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-alpha-white5)] flex items-center justify-center shadow-sm">
                <Search size={16} className="text-[var(--color-text-muted)]" />
              </div>
              <span className="font-[var(--font-medium)] text-[var(--text-sm)]">Search Tasks...</span>
            </div>
          </button>

          <div className="px-3 py-2 mt-2 text-[10px] font-[var(--font-bold)] uppercase tracking-[var(--tracking-widest)] text-[var(--color-text-muted)] opacity-70">
            Goals
          </div>
          <button 
            onClick={() => handleAction(() => router.push('/goals'))}
            className="w-full flex items-center justify-between px-3 py-3 rounded-[var(--radius-lg)] hover:bg-[var(--color-alpha-white5)] group transition-all duration-200"
          >
            <div className="flex items-center gap-3 text-[var(--color-text-primary)]">
              <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-alpha-white5)] flex items-center justify-center shadow-sm">
                <Target size={16} className="text-[var(--color-brand-primary)]" />
              </div>
              <span className="font-[var(--font-medium)] text-[var(--text-sm)]">Open Goals Workspace</span>
            </div>
          </button>

        </div>

      </div>

      {/* Dismiss overlay */}
      <div className="absolute inset-0 z-[-1]" onClick={() => setIsOpen(false)} />
    </div>
  );
}
