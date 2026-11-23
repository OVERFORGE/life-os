"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, Send, X, Sparkles, CheckCircle2, Pause, Play, Volume2, Loader2 } from "lucide-react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";

/**
 * LifeOS Dynamic Ledge Notch HUD
 * 
 * Engineered to sit flush at the top-center of the screen like a native Dynamic Island / Dynamic Ledge.
 * Features:
 * - 100% transparent screen overlay with top-anchored glass pill
 * - Smooth cursor hover expand / retract
 * - Ambient speech transcription via Groq Whisper Large v3 Turbo
 * - Live execution monitoring and instant conversational intelligence
 */
export default function DynamicLedgeHudPage() {
  const { projection, completeTask, pauseExecution } = useInteractionSurface();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Listen for wake word triggers from Electron supervisor
  useEffect(() => {
    if (typeof window !== "undefined" && window.lifeosDesktop?.onAvenWake) {
      const unsub = window.lifeosDesktop.onAvenWake((payload: any) => {
        console.log("[DynamicNotch] Wake event received:", payload);
        startVoiceRecording();
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  const hideHud = async () => {
    stopVoiceRecording();
    const { toggleHudWindow } = await import("@/lib/desktopBridge");
    await toggleHudWindow();
  };

  const startVoiceRecording = async () => {
    if (isListening || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 2000) {
          await transcribeAudioBlob(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      setVoiceTranscript("Listening... (speak now)");

      // Automatic 4.5s capture window for hands-free speech
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        stopVoiceRecording();
      }, 4500);
    } catch (err) {
      console.warn("[DynamicNotch] Microphone capture failed:", err);
      setIsListening(false);
    }
  };

  const stopVoiceRecording = () => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsListening(false);
    }
  };

  const transcribeAudioBlob = async (blob: Blob) => {
    setIsTranscribing(true);
    setVoiceTranscript("Transcribing via Whisper...");
    try {
      const formData = new FormData();
      formData.append("file", blob, "voice-command.webm");

      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const transcribedText = data.text?.trim() || "";
        if (transcribedText) {
          setInput(transcribedText);
          setVoiceTranscript("");
          // Automatically trigger conversational query with transcribed voice input
          handleSendWithText(transcribedText);
        } else {
          setVoiceTranscript("No clear speech detected.");
          setTimeout(() => setVoiceTranscript(""), 2000);
        }
      }
    } catch (err) {
      console.warn("[DynamicNotch] Transcription failed:", err);
      setVoiceTranscript("Voice processing failed.");
      setTimeout(() => setVoiceTranscript(""), 2000);
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleVoiceMode = () => {
    if (isListening) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  const handleSendWithText = async (textToSend: string) => {
    if (!textToSend.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setResponse(null);

    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          model: "llama-3.3-70b-versatile",
          mode: "general",
          surfaceContext: {
            activeExecutionTitle: projection?.activeExecution?.title,
            activeExecutionCategory: projection?.activeExecution?.category,
            currentInteractionMode: projection?.interactionMode,
            sourceSurface: "DESKTOP_DYNAMIC_NOTCH",
          },
        }),
      });

      if (res.ok) {
        const text = await res.text();
        const clean = text.replace(/<think>[\s\S]*?<\/think>\n?/g, "").trim();
        setResponse(clean);
      } else {
        setResponse("Aven couldn't process this request. Please try again.");
      }
    } catch {
      setResponse("Network error connecting to Aven intelligence.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    handleSendWithText(text);
  };

  const active = projection?.activeExecution;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden select-none p-0 m-0 relative">
      {/* Dynamic Ledge Notch Container */}
      <div
        id="dynamic-ledge-notch"
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[580px] bg-[#0E0F12]/95 backdrop-blur-3xl border-b border-x border-white/10 rounded-b-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_24px_rgba(232,65,74,0.14)] p-4 text-white transition-all duration-300 ease-out z-50"
      >
        {/* Notch Top Status Pill */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.06]">
          <div className="flex items-center space-x-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E8414A] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E8414A]"></span>
            </span>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-gray-300">
              {isListening ? "Aven Listening..." : isTranscribing ? "Whisper Processing..." : "Aven Dynamic Notch"}
            </span>

            {/* Audio Waveform Animation when listening */}
            {isListening && (
              <div className="flex items-center space-x-0.5 ml-2">
                <span className="w-1 h-3 bg-[#E8414A] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-4 bg-[#E8414A] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-2 bg-[#E8414A] rounded-full animate-bounce"></span>
                <span className="w-1 h-3.5 bg-[#E8414A] rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              </div>
            )}
          </div>

          {/* Active Execution Pill */}
          {active && active.status === "ACTIVE" ? (
            <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A]"></span>
              <span className="font-medium text-gray-200 truncate max-w-[140px]">{active.title}</span>
              <span className="text-gray-400 font-mono">{Math.round(active.remainingSeconds / 60)}m</span>
              <button
                onClick={() => completeTask(active.taskId || active.occurrenceId || "active")}
                className="text-[9px] px-1.5 py-0.5 bg-[#E8414A] text-white rounded font-bold hover:bg-[#D62C35] transition"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-gray-500 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[9px] text-gray-400">Esc</span>
              <span>to dismiss</span>
            </div>
          )}

          <button
            onClick={hideHud}
            className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
            title="Close Notch"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dynamic Voice Status Hint */}
        {voiceTranscript && (
          <div className="text-[11px] text-[#E8414A] mb-2 px-1 flex items-center space-x-1.5 font-medium animate-pulse">
            <Volume2 className="w-3.5 h-3.5" />
            <span>{voiceTranscript}</span>
          </div>
        )}

        {/* Search & Prompt Input Row */}
        <div className="flex items-center space-x-2.5 bg-black/40 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#E8414A]/60 transition">
          <Sparkles className="w-4 h-4 text-[#E8414A] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Ask Aven anything or issue an execution command..."
            className="flex-1 bg-transparent text-white text-xs placeholder-gray-500 focus:outline-none"
          />

          {/* Voice Microphone Toggle */}
          <button
            onClick={toggleVoiceMode}
            className={`p-1.5 rounded-lg transition ${
              isListening
                ? "bg-[#E8414A] text-white animate-pulse"
                : isTranscribing
                ? "bg-amber-500/20 text-amber-400"
                : "hover:bg-white/10 text-gray-400 hover:text-gray-200"
            }`}
            title={isListening ? "Stop listening" : "Speak to Aven (Whisper Large Turbo)"}
          >
            {isTranscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          {/* Send Action */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSubmitting}
            className="p-1.5 rounded-lg bg-[#E8414A] hover:bg-[#D62C35] disabled:opacity-30 text-white transition shrink-0"
            title="Send"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Expandable Intelligence Drawer */}
        {(isSubmitting || response) && (
          <div className="mt-3 p-3.5 border border-white/10 rounded-xl bg-black/60 text-xs text-[#ECE7E3] max-h-52 overflow-y-auto transition-all duration-200">
            {isSubmitting ? (
              <div className="flex items-center space-x-2 text-gray-400 py-1">
                <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-ping" />
                <span className="font-medium">Aven is reasoning across your LifeOS context…</span>
              </div>
            ) : (
              <div className="leading-relaxed whitespace-pre-wrap font-sans text-gray-200">
                {response}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
