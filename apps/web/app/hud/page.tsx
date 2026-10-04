"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Mic, Send, X, Sparkles, CheckCircle2, Play, Pause, Clock } from "lucide-react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";

/**
 * LifeOS Desktop Spotlight HUD (Phase 8)
 * 
 * Minimal, centered, transient surface invoked via global shortcut (Ctrl+Alt+Space)
 * or system tray. Provides <150ms access to Aven conversational intelligence
 * and active execution controls without launching the heavy dashboard.
 */
export default function SpotlightHudPage() {
  const { data: session } = useSession();
  const { projection, completeTask, pauseExecution } = useInteractionSurface();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Listen for Escape key to hide HUD window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideHud();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hideHud = async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("toggle_hud");
      } catch {}
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isSubmitting) return;

    const userText = input.trim();
    setInput("");
    setIsSubmitting(true);
    setResponse(null);

    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          model: "llama-3.3-70b-versatile",
          mode: "general",
          surfaceContext: {
            activeExecutionTitle: projection?.activeExecution?.title,
            activeExecutionCategory: projection?.activeExecution?.category,
            currentInteractionMode: projection?.interactionMode,
            sourceSurface: "DESKTOP_SPOTLIGHT_HUD",
          },
        }),
      });

      if (res.ok) {
        const text = await res.text();
        const clean = text.replace(/<think>[\s\S]*?<\/think>\n?/g, "").trim();
        setResponse(clean);
      } else {
        setResponse("Couldn't process request. Please try again.");
      }
    } catch {
      setResponse("Network error connecting to Aven.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const active = projection?.activeExecution;

  return (
    <div className="flex items-center justify-center min-h-screen bg-black/60 p-4 font-sans select-none backdrop-blur-sm">
      <div className="w-full max-w-xl bg-[#161618] border border-[#2A2B2F] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200">
        
        {/* Top Active Bar (if execution in progress) */}
        {active && active.status === "ACTIVE" && (
          <div className="bg-[#1F2023] border-b border-[#2A2B2F] px-4 py-2.5 flex items-center justify-between text-xs text-[#ECE7E3]">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-pulse" />
              <span className="font-semibold text-white truncate max-w-[280px]">
                {active.title}
              </span>
              <span className="text-gray-400 font-mono">
                {Math.round(active.remainingSeconds / 60)}m left
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => completeTask(active.taskId || active.occurrenceId || "active")}
                className="px-2.5 py-1 rounded bg-[#E8414A] hover:bg-[#D62C35] text-white text-[11px] font-semibold transition"
              >
                Done
              </button>
              <button
                onClick={() => pauseExecution(active.taskId || active.occurrenceId || "active")}
                className="px-2 py-1 rounded bg-[#2A2B2F] hover:bg-[#38393F] text-gray-300 text-[11px] transition"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="px-4 py-3 flex items-center space-x-3">
          <Sparkles className="w-5 h-5 text-[#E8414A] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Ask Aven or tell me what to execute..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
          />
          <button
            onClick={() => setIsListening(!isListening)}
            className={`p-2 rounded-lg transition ${
              isListening ? "bg-[#E8414A] text-white animate-pulse" : "hover:bg-[#2A2B2F] text-gray-400"
            }`}
            title="Push to talk"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSubmitting}
            className="p-2 rounded-lg bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-40 text-white transition"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            onClick={hideHud}
            className="p-2 rounded-lg hover:bg-[#2A2B2F] text-gray-400 hover:text-white transition"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Response / Thought Area */}
        {(isSubmitting || response) && (
          <div className="px-5 py-4 border-t border-[#2A2B2F] bg-[#1A1A1D] text-xs text-[#ECE7E3] max-h-60 overflow-y-auto">
            {isSubmitting ? (
              <div className="flex items-center space-x-2 text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A] animate-ping" />
                <span>Aven is thinking…</span>
              </div>
            ) : (
              <div className="leading-relaxed whitespace-pre-wrap font-sans text-gray-200">
                {response}
              </div>
            )}
          </div>
        )}

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-[#2A2B2F]/60 flex items-center justify-between text-[10px] text-gray-500">
          <span>Esc to hide</span>
          <span>Aven Ambient Presence • LifeOS</span>
        </div>

      </div>
    </div>
  );
}
