"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, ArrowUp, X, Sparkles, Check, Copy, Loader2 } from "lucide-react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";

/**
 * Aven Minimal HUD
 * 
 * Clean, lightweight, zero-jargon ambient interaction surface.
 * Sits flush at the top of the display with studio styling.
 */
export default function AvenHudPage() {
  const { projection, completeTask } = useInteractionSurface();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [copied, setCopied] = useState(false);
  
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

  // Listen for wake word triggers from Electron supervisor ("Hey Aven")
  useEffect(() => {
    if (typeof window !== "undefined" && window.lifeosDesktop?.onAvenWake) {
      const unsub = window.lifeosDesktop.onAvenWake((payload: any) => {
        // Only trigger if verified "Hey Aven"
        if (payload?.keyword === "Hey Aven") {
          if (payload?.command && typeof payload.command === "string" && payload.command.trim().length > 0) {
            // User uttered wake word and command together ("Hey Aven what are my tasks")
            const cmd = payload.command.trim();
            setInput(cmd);
            handleSendWithText(cmd);
          } else {
            // User just called "Hey Aven" - start listening for conversational speech
            startVoiceRecording();
          }
        }
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

      // 4.5s automatic capture window for conversational speech
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = setTimeout(() => {
        stopVoiceRecording();
      }, 4500);
    } catch (err) {
      console.warn("[AvenHUD] Microphone capture error:", err);
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
          handleSendWithText(transcribedText);
        }
      }
    } catch (err) {
      console.warn("[AvenHUD] Transcription failed:", err);
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
            sourceSurface: "DESKTOP_HUD",
          },
        }),
      });

      if (res.ok) {
        const text = await res.text();
        const clean = text.replace(/<think>[\s\S]*?<\/think>\n?/g, "").trim();
        setResponse(clean);
      } else {
        setResponse("Couldn't process this right now. Please try again.");
      }
    } catch {
      setResponse("Network error connecting to Aven.");
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

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const active = projection?.activeExecution;

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden select-none p-0 m-0 relative font-sans">
      
      {/* Floating HUD Container */}
      <div
        id="aven-hud-pill"
        className="fixed top-2 left-1/2 -translate-x-1/2 w-[540px] max-w-[92vw] bg-[#111113]/95 backdrop-blur-2xl border border-[#23242A] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3 text-[#F7F5F0] z-50 transition-all duration-200"
      >
        {/* Subtle top amber glow line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D98B2B]/40 to-transparent rounded-t-2xl pointer-events-none" />

        {/* Minimal Header Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#23242A]/60">
          
          {/* Left: Brand + State */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D98B2B] shadow-[0_0_6px_#D98B2B]" />
            <span className="text-xs font-bold tracking-tight text-[#F7F5F0]">Aven</span>

            {isListening && (
              <span className="text-[11px] text-[#D98B2B] font-mono flex items-center gap-1.5 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] animate-ping" />
                Listening
              </span>
            )}

            {isTranscribing && (
              <span className="text-[11px] text-[#85827A] font-mono flex items-center gap-1.5 ml-1">
                <Loader2 size={11} className="animate-spin text-[#D98B2B]" />
                Processing
              </span>
            )}
          </div>

          {/* Center: Active Task (if executing) */}
          {active && active.status === "ACTIVE" ? (
            <div className="flex items-center gap-2 bg-[#17171A] border border-[#23242A] px-2.5 py-0.5 rounded-full text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B]" />
              <span className="font-medium text-[#F7F5F0] truncate max-w-[130px]">{active.title}</span>
              <span className="text-[#85827A] font-mono">{Math.round(active.remainingSeconds / 60)}m</span>
              <button
                onClick={() => completeTask(active.taskId || active.occurrenceId || "active")}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[#23242A] hover:bg-[#32343D] text-[#D98B2B] font-semibold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-[#66635B] font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-[#17171A] border border-[#23242A] text-[#85827A]">esc</kbd>
              <span>to dismiss</span>
            </div>
          )}

          {/* Right: Close Action */}
          <button
            onClick={hideHud}
            className="p-1 rounded-lg text-[#85827A] hover:text-[#F7F5F0] hover:bg-[#23242A] transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </div>

        {/* Input Capsule Row */}
        <div className="flex items-center gap-2 bg-[#17171A] border border-[#23242A] focus-within:border-[#D98B2B]/60 rounded-xl px-3 py-2 transition-all shadow-inner">
          <Sparkles size={14} className="text-[#D98B2B] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Ask Aven or log a note..."
            className="flex-1 bg-transparent text-[#F7F5F0] text-xs placeholder-[#66635B] focus:outline-none min-w-0"
          />

          {/* Voice Microphone Toggle */}
          <button
            onClick={toggleVoiceMode}
            type="button"
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              isListening
                ? "bg-[#D98B2B] text-[#111113] shadow-md animate-pulse"
                : "text-[#85827A] hover:text-[#ffb86c] hover:bg-[#23242A]"
            }`}
            title={isListening ? "Stop listening" : "Speak to Aven"}
          >
            {isTranscribing ? <Loader2 size={13} className="animate-spin text-[#D98B2B]" /> : <Mic size={13} />}
          </button>

          {/* Submit Action */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSubmitting}
            type="button"
            className={`p-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
              input.trim() && !isSubmitting
                ? "bg-[#D98B2B] hover:bg-[#EAA13F] text-[#111113] shadow-md active:scale-95"
                : "bg-[#23242A] text-[#66635B] cursor-not-allowed opacity-40"
            }`}
            title="Send"
          >
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} className="stroke-[2.5]" />}
          </button>
        </div>

        {/* Expandable Response Container */}
        {(isSubmitting || response) && (
          <div className="mt-2.5 p-3.5 border border-[#23242A] rounded-xl bg-[#17171A] text-xs text-[#D8D5CD] max-h-56 overflow-y-auto leading-relaxed custom-h-scrollbar">
            {isSubmitting ? (
              <div className="flex items-center gap-2 text-[#85827A] py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] animate-ping" />
                <span className="font-mono text-[11px]">Thinking...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="whitespace-pre-wrap leading-relaxed text-[#F7F5F0] text-xs">
                  {response}
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#23242A]/60 text-[10px] text-[#85827A]">
                  <button
                    onClick={copyResponse}
                    className="flex items-center gap-1 hover:text-[#F7F5F0] transition-colors cursor-pointer"
                  >
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={() => setResponse(null)}
                    className="hover:text-[#F7F5F0] transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
