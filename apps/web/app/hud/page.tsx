"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, ArrowUp, Sparkles, Check, Copy, Loader2 } from "lucide-react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";
import { AvenBlob } from "@/components/ai/AvenBlob";

/**
 * Aven Minimal HUD with Interactive WebGL2 Assistant Orb
 * 
 * Clean, lightweight, studio-grade ambient interaction surface.
 * Features:
 * 1. Full-duplex conversational voice interaction via native acoustic supervisor.
 * 2. Interactive WebGL2 Aven Orb with responsive states (idle, listening, thinking, speaking).
 * 3. 100% transparent frameless desktop backdrop with zero black box.
 * 4. Auto-summon on top-center hover, auto-dismiss on mouse leave.
 */
export default function AvenHudPage() {
  const { projection, completeTask } = useInteractionSurface();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Force 100% transparency on html and body for frameless desktop overlay
  useEffect(() => {
    document.documentElement.classList.add("hud-transparent");
    document.body.classList.add("hud-transparent");
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.documentElement.style.setProperty("background-color", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background-color", "transparent", "important");
    return () => {
      document.documentElement.classList.remove("hud-transparent");
      document.body.classList.remove("hud-transparent");
      document.documentElement.style.removeProperty("background");
      document.documentElement.style.removeProperty("background-color");
      document.body.style.removeProperty("background");
      document.body.style.removeProperty("background-color");
    };
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
        if (payload?.keyword === "Hey Aven") {
          setResponse(null);
          if (payload?.command && typeof payload.command === "string" && payload.command.trim().length > 0) {
            // User uttered wake word and command together ("Hey Aven what are my tasks")
            const cmd = payload.command.trim();
            setInput(cmd);
            handleSendWithText(cmd);
          } else {
            // User called "Hey Aven" - activate listening state for their conversational turn
            setIsListening(true);
            inputRef.current?.focus();
          }
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  // Listen for active conversational speech turns from Electron supervisor (duplex communication)
  useEffect(() => {
    if (typeof window !== "undefined" && (window.lifeosDesktop as any)?.onAvenSpeech) {
      const unsub = (window.lifeosDesktop as any).onAvenSpeech((payload: { transcribed: string }) => {
        const text = payload?.transcribed?.trim();
        if (text) {
          console.log("[AvenHUD] 🗣️ Received user speech turn:", text);
          setIsListening(false);
          setInput(text);
          handleSendWithText(text);
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  const hideHud = async () => {
    stopBrowserRecording();
    setIsListening(false);
    const { toggleHudWindow } = await import("@/lib/desktopBridge");
    await toggleHudWindow();
  };

  /**
   * Browser microphone fallback for when running outside Electron desktop shell
   */
  const startBrowserRecording = async () => {
    if (isListening || isSubmitting) return;
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
        if (audioBlob.size > 1500) {
          await transcribeBrowserAudio(audioBlob);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.warn("[AvenHUD] Browser microphone error:", err);
      setIsListening(false);
    }
  };

  const stopBrowserRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
      setIsListening(false);
    }
  };

  const transcribeBrowserAudio = async (blob: Blob) => {
    setIsSubmitting(true);
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
      console.warn("[AvenHUD] Whisper transcription fallback failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleVoiceMode = () => {
    if (isListening) {
      setIsListening(false);
      stopBrowserRecording();
    } else {
      setIsListening(true);
      // In browser mode, start recording; in desktop mode, native supervisor is already active
      if (!window.lifeosDesktop) {
        startBrowserRecording();
      }
    }
  };

  const handleSend = () => {
    handleSendWithText(input);
  };

  const handleSendWithText = async (textToSend: string) => {
    if (!textToSend.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setIsListening(false);
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

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const active = projection?.activeExecution;
  const currentBlobState = isSubmitting ? "thinking" : isListening ? "listening" : response ? "speaking" : "idle";

  return (
    <div
      data-hud-root
      id="aven-hud-root"
      className="w-screen h-screen bg-transparent overflow-hidden select-none p-0 m-0 relative font-sans"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        html, body, #__next {
          background: transparent !important;
          background-color: transparent !important;
          overflow: hidden !important;
        }
      `}} />

      {/* Floating HUD Pill Notch */}
      <div
        id="aven-hud-pill"
        onMouseLeave={() => {
          // Auto-close HUD when user moves cursor away, unless actively waiting for response
          if (!isSubmitting) {
            hideHud();
          }
        }}
        className="fixed top-2 left-1/2 -translate-x-1/2 w-[540px] max-w-[92vw] bg-[#111113]/95 backdrop-blur-2xl border border-[#23242A] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 text-[#F7F5F0] z-50 transition-all duration-200"
      >
        {/* Subtle top amber glow line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D98B2B]/40 to-transparent rounded-t-2xl pointer-events-none" />

        {/* Minimal Header Bar */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#23242A]/60">
          {/* Left: Brand + Realtime State Indicator */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D98B2B] shadow-[0_0_6px_#D98B2B]" />
            <span className="text-xs font-bold tracking-tight text-[#F7F5F0]">Aven</span>

            {isListening && (
              <span className="text-[11px] text-[#D98B2B] font-mono flex items-center gap-1.5 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B] animate-ping" />
                Listening
              </span>
            )}

            {isSubmitting && (
              <span className="text-[11px] text-[#D98B2B] font-mono flex items-center gap-1.5 ml-1">
                <Loader2 size={11} className="animate-spin text-[#D98B2B]" />
                Thinking
              </span>
            )}
          </div>

          {/* Right: Active Task (if executing) */}
          {active && active.status === "ACTIVE" && (
            <div className="flex items-center gap-2 bg-[#17171A] border border-[#23242A] px-2.5 py-0.5 rounded-full text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B]" />
              <span className="font-medium text-[#F7F5F0] truncate max-w-[160px]">{active.title}</span>
              <span className="text-[#85827A] font-mono">{Math.round(active.remainingSeconds / 60)}m</span>
              <button
                onClick={() => completeTask(active.taskId || active.occurrenceId || "active")}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[#23242A] hover:bg-[#32343D] text-[#D98B2B] font-semibold transition cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Central Aven Orb - Interactive WebGL2 Assistant Orb */}
        <div className="flex flex-col items-center justify-center py-1.5 relative">
          {/* Ambient Radial Golden Aura */}
          <div
            className={`absolute w-28 h-28 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${
              isSubmitting
                ? "bg-[#D98B2B]/40 scale-125"
                : isListening
                ? "bg-[#D98B2B]/35 scale-110 animate-pulse"
                : "bg-[#D98B2B]/15"
            }`}
          />

          <div
            onClick={toggleVoiceMode}
            className="w-24 h-24 relative flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95"
            title={isListening ? "Listening... click to pause" : "Click to speak with Aven"}
          >
            <AvenBlob
              colors={["#D98B2B", "#F5E6C8", "#8C5212"]}
              backgroundColor="#111113"
              size={1.05}
              glow={isListening ? 1.45 : isSubmitting ? 1.6 : 1.15}
              bleed={1.0}
              wobble={isListening ? 1.2 : isSubmitting ? 1.45 : 0.85}
              speed={isSubmitting ? 1.8 : isListening ? 1.35 : 0.9}
              state={currentBlobState}
              followCursor={true}
              clickPulse={true}
              className="w-full h-full"
            />
          </div>

          <p className="text-[11px] font-mono text-[#85827A] mt-1 tracking-tight">
            {isSubmitting
              ? "Aven is reasoning across your context..."
              : isListening
              ? "Listening... speak naturally"
              : "Ask Aven anything or speak your command"}
          </p>
        </div>

        {/* Input Capsule Row */}
        <div className="flex items-center gap-2 bg-[#17171A] border border-[#23242A] focus-within:border-[#D98B2B]/60 rounded-xl px-3 py-2 mt-1.5 transition-all shadow-inner">
          <Sparkles size={14} className="text-[#D98B2B] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Type a command or speak naturally..."
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
            title={isListening ? "Pause microphone" : "Speak to Aven"}
          >
            {isSubmitting ? <Loader2 size={13} className="animate-spin text-[#D98B2B]" /> : <Mic size={13} />}
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
