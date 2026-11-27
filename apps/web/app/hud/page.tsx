"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, ArrowUp, Sparkles, Check, Copy, Loader2, X, Volume2 } from "lucide-react";
import { useInteractionSurface } from "@/hooks/useInteractionSurface";
import { AvenBlob } from "@/components/ai/AvenBlob";

/**
 * Aven Minimal HUD with Full-Duplex Voice & Interactive WebGL2 Assistant Orb
 * 
 * Studio-grade, ambient interaction surface:
 * 1. Full-duplex conversational voice interaction via native acoustic supervisor.
 * 2. Authentic British male neural voice synthesis (en-GB-RyanNeural).
 * 3. 100% semantic conversation conclusion (zero regex on user speech).
 * 4. Interactive WebGL2 Aven Orb with responsive states (idle, listening, thinking, speaking).
 * 5. Transparent frameless desktop overlay with zero glitching or accidental auto-dismiss.
 */
export default function AvenHudPage() {
  const { projection, completeTask } = useInteractionSurface();
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioContextRef = useRef<AudioContext | null>(null);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Reset silence timer: auto-closes HUD gracefully after 25s of complete silence
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    silenceTimerRef.current = setTimeout(() => {
      console.log("[AvenHUD] Inactivity timeout reached (25s silence). Closing HUD.");
      hideHud();
    }, 25000);
  }, []);

  const hideHud = useCallback(async () => {
    stopBrowserRecording();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.stop();
        activeSourceNodeRef.current.disconnect();
      } catch (_) {}
      activeSourceNodeRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      } catch (_) {}
      audioRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
    setIsSubmitting(false);

    try {
      const { hideHudWindow, setConversationActive } = await import("@/lib/desktopBridge");
      await setConversationActive(false);
      await hideHudWindow();
    } catch (err) {
      console.warn("[AvenHUD] hideHud bridge call error:", err);
    }
  }, []);

  // Listen for Escape key to dismiss HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideHud();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hideHud]);

  // Synthesize and play British neural voice response via Web Audio API (zero gesture required in Electron)
  const playTtsAudio = useCallback(async (text: string, isConcluded: boolean) => {
    if (!text || typeof window === "undefined") return;

    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.stop();
        activeSourceNodeRef.current.disconnect();
      } catch (_) {}
      activeSourceNodeRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
      } catch (_) {}
      audioRef.current = null;
    }

    setIsSpeaking(true);
    setIsListening(false);

    try {
      console.log(`[AvenHUD] 🔊 Requesting British TTS synthesis for: "${text.slice(0, 60)}..."`);
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: "en-GB-RyanNeural",
          rate: "+6%",
          pitch: "+0Hz",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `TTS returned status ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      console.log(`[AvenHUD] 🔊 Received audio buffer (${arrayBuffer.byteLength} bytes). Decoding via Web Audio API...`);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!activeAudioContextRef.current || activeAudioContextRef.current.state === "closed") {
        activeAudioContextRef.current = new AudioContextClass();
      }
      const audioCtx = activeAudioContextRef.current;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      // Decode audio frames directly to PCM memory buffer
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(audioCtx.destination);
      activeSourceNodeRef.current = sourceNode;

      sourceNode.onended = () => {
        console.log("[AvenHUD] 🔊 Web Audio playback ended cleanly.");
        setIsSpeaking(false);
        activeSourceNodeRef.current = null;
        if (isConcluded) {
          console.log("[AvenHUD] Conversation semantically concluded. Dismissing HUD.");
          setTimeout(() => {
            hideHud();
          }, 450);
        } else {
          // Full-duplex: resume listening for user's next spoken turn
          setIsListening(true);
          resetSilenceTimer();
        }
      };

      sourceNode.start(0);
      console.log("[AvenHUD] 🔊 Web Audio API playback started successfully!");
    } catch (err: any) {
      console.warn("[AvenHUD] ❌ Web Audio API error, attempting HTML5 Audio fallback:", err?.message || err);
      try {
        const blobRes = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "en-GB-RyanNeural", rate: "+6%", pitch: "+0Hz" }),
        });
        if (blobRes.ok) {
          const rawBlob = await blobRes.blob();
          const audioBlob = new Blob([rawBlob], { type: "audio/mpeg" });
          const objectUrl = URL.createObjectURL(audioBlob);
          const fallbackAudio = new Audio(objectUrl);
          fallbackAudio.volume = 1.0;
          audioRef.current = fallbackAudio;

          fallbackAudio.onended = () => {
            setIsSpeaking(false);
            audioRef.current = null;
            URL.revokeObjectURL(objectUrl);
            if (isConcluded) hideHud();
            else {
              setIsListening(true);
              resetSilenceTimer();
            }
          };

          fallbackAudio.onerror = (e) => {
            console.warn("[AvenHUD] ❌ Fallback audio error:", e);
            setIsSpeaking(false);
            audioRef.current = null;
            URL.revokeObjectURL(objectUrl);
            if (isConcluded) hideHud();
            else {
              setIsListening(true);
              resetSilenceTimer();
            }
          };

          await fallbackAudio.play();
          return;
        }
      } catch (fallbackErr) {
        console.warn("[AvenHUD] ❌ Fallback also failed:", fallbackErr);
      }

      setIsSpeaking(false);
      activeSourceNodeRef.current = null;
      if (isConcluded) {
        hideHud();
      } else {
        setIsListening(true);
        resetSilenceTimer();
      }
    }
  }, [hideHud, resetSilenceTimer]);

  const handleSendWithText = useCallback(async (textToSend: string) => {
    if (!textToSend.trim() || isSubmitting) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsSubmitting(true);
    setIsListening(false);
    setIsSpeaking(false);
    setResponse(null);

    try {
      const res = await fetch("/api/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
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
        const rawText = await res.text();
        const isConcluded = /<dialogue_status>\s*concluded\s*<\/dialogue_status>/i.test(rawText);
        const clean = rawText
          .replace(/<think>[\s\S]*?<\/think>\n?/gi, "")
          .replace(/<planning>[\s\S]*?<\/planning>\n?/gi, "")
          .replace(/<dialogue_status>[\s\S]*?<\/dialogue_status>\n?/gi, "")
          .trim();

        setResponse(clean);
        setIsSubmitting(false);

        // Synthesize and speak Aven's response in British accent
        playTtsAudio(clean, isConcluded);
      } else {
        const fallback = "Couldn't process this right now. Please try again.";
        setResponse(fallback);
        setIsSubmitting(false);
        playTtsAudio(fallback, false);
      }
    } catch {
      const errorMsg = "Network error connecting to Aven.";
      setResponse(errorMsg);
      setIsSubmitting(false);
      playTtsAudio(errorMsg, false);
    }
  }, [isSubmitting, playTtsAudio, projection]);

  // Listen for wake word triggers from Electron supervisor ("Hey Aven")
  useEffect(() => {
    if (typeof window !== "undefined" && window.lifeosDesktop?.onAvenWake) {
      const unsub = window.lifeosDesktop.onAvenWake((payload: any) => {
        if (payload?.keyword === "Hey Aven") {
          setResponse(null);
          resetSilenceTimer();

          // Unlock audio context proactively on wake detection
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              if (ctx.state === "suspended") {
                ctx.resume().catch(() => {});
              }
            }
          } catch (_) {}

          if (payload?.command && typeof payload.command === "string" && payload.command.trim().length > 0) {
            // User uttered wake word and command together ("Hey Aven what are my tasks")
            const cmd = payload.command.trim();
            setInput(cmd);
            handleSendWithText(cmd);
          } else {
            // User called "Hey Aven" - activate listening state for their conversational turn
            setIsListening(true);
            setIsSpeaking(false);
            inputRef.current?.focus();
          }
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, [handleSendWithText, resetSilenceTimer]);

  // Listen for active conversational speech turns from Electron supervisor (duplex communication)
  useEffect(() => {
    if (typeof window !== "undefined" && (window.lifeosDesktop as any)?.onAvenSpeech) {
      const unsub = (window.lifeosDesktop as any).onAvenSpeech((payload: { transcribed: string }) => {
        const text = payload?.transcribed?.trim();
        if (text) {
          console.log("[AvenHUD] 🗣️ Received user speech turn:", text);
          resetSilenceTimer();
          setIsListening(false);
          setInput(text);
          handleSendWithText(text);
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, [handleSendWithText, resetSilenceTimer]);

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
      resetSilenceTimer();
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
      resetSilenceTimer();
      if (!window.lifeosDesktop) {
        startBrowserRecording();
      }
    }
  };

  const handleSend = () => {
    handleSendWithText(input);
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const active = projection?.activeExecution;
  const currentBlobState = isSubmitting
    ? "thinking"
    : isSpeaking
    ? "speaking"
    : isListening
    ? "listening"
    : "idle";

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

            {isSpeaking && (
              <span className="text-[11px] text-amber-400 font-mono flex items-center gap-1.5 ml-1">
                <Volume2 size={11} className="animate-pulse text-amber-400" />
                Speaking
              </span>
            )}
          </div>

          {/* Right: Active Task + Dismiss Controls */}
          <div className="flex items-center gap-2.5">
            {active && active.status === "ACTIVE" && (
              <div className="flex items-center gap-2 bg-[#17171A] border border-[#23242A] px-2.5 py-0.5 rounded-full text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D98B2B]" />
                <span className="font-medium text-[#F7F5F0] truncate max-w-[140px]">{active.title}</span>
                <span className="text-[#85827A] font-mono">{Math.round(active.remainingSeconds / 60)}m</span>
                <button
                  onClick={() => completeTask(active.taskId || active.occurrenceId || "active")}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-[#23242A] hover:bg-[#32343D] text-[#D98B2B] font-semibold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            <span className="text-[10px] text-[#85827A] font-mono hidden sm:inline-flex items-center gap-1">
              <kbd className="bg-[#17171A] border border-[#23242A] px-1 py-0.5 rounded text-[9px] text-[#A5A29A]">esc</kbd> to dismiss
            </span>
          </div>
        </div>

        {/* Central Aven Orb - Interactive WebGL2 Assistant Orb */}
        <div className="flex flex-col items-center justify-center py-1.5 relative">
          {/* Ambient Radial Golden Aura */}
          <div
            className={`absolute w-28 h-28 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${
              isSubmitting
                ? "bg-[#D98B2B]/40 scale-125"
                : isSpeaking
                ? "bg-[#D98B2B]/45 scale-120 animate-pulse"
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
              glow={isSpeaking ? 1.7 : isListening ? 1.45 : isSubmitting ? 1.6 : 1.15}
              bleed={1.0}
              wobble={isSpeaking ? 1.5 : isListening ? 1.2 : isSubmitting ? 1.45 : 0.85}
              speed={isSpeaking ? 1.9 : isSubmitting ? 1.8 : isListening ? 1.35 : 0.9}
              state={currentBlobState}
              followCursor={true}
              clickPulse={true}
              className="w-full h-full"
            />
          </div>

          <p className="text-[11px] font-mono text-[#85827A] mt-1 tracking-tight">
            {isSubmitting
              ? "Aven is reasoning across your context..."
              : isSpeaking
              ? "Aven is speaking..."
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
                <div className="flex items-center justify-between pt-2 border-t border-[#23242A]/60 text-[10px] text-[#85827A]">
                  <div className="flex items-center gap-1.5 text-amber-500/80 font-mono text-[10px]">
                    <Volume2 size={11} />
                    <span>British Neural Voice</span>
                  </div>
                  <div className="flex items-center gap-3">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
