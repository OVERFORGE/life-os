"use client";

import React, { useEffect } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  X,
  Volume2,
  Radio,
  AlertCircle,
  Send,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useRealtimeVoice } from "./useRealtimeVoice";
import { AvenBlob } from "@/components/ai/AvenBlob";

interface RealtimeVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string | null;
  onMessageSent?: () => void;
}

export default function RealtimeVoiceModal({
  isOpen,
  onClose,
  conversationId,
  onMessageSent,
}: RealtimeVoiceModalProps) {
  const {
    status,
    audioLevel,
    isMuted,
    hasDetectedUserSpeech,
    userTranscript,
    assistantTranscript,
    errorMessage,
    startSession,
    endSession,
    toggleMute,
    interruptAssistant,
    finishSpeakingAndSend,
  } = useRealtimeVoice({
    conversationId,
    onTurnComplete: () => {
      onMessageSent?.();
    },
  });

  // Automatically start voice session on modal open, stop on close
  useEffect(() => {
    if (isOpen) {
      startSession();
    } else {
      endSession();
    }
  }, [isOpen, startSession, endSession]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        endSession();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, endSession, onClose]);

  if (!isOpen) return null;

  // Map voice status to AvenBlob WebGL2 state
  const blobState: "idle" | "listening" | "thinking" | "speaking" =
    status === "listening"
      ? "listening"
      : status === "speaking"
      ? "speaking"
      : status === "transcribing" || status === "thinking"
      ? "thinking"
      : "idle";

  const dynamicGlow = 1.2 + audioLevel * 1.6;
  const dynamicWobble = 0.85 + audioLevel * 0.9;
  const dynamicSpeed =
    status === "speaking" ? 1.5 : status === "listening" ? 1.0 + audioLevel * 0.6 : 0.9;
  const orbScale = 1 + audioLevel * 0.15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111113]/98 backdrop-blur-3xl transition-all duration-300 select-none overflow-hidden text-[#F7F5F0]">
      {/* Ambient Warm Amber Glow Background Mesh */}
      <div className="absolute -inset-[30%] pointer-events-none transition-all duration-1000 opacity-25 blur-[140px] bg-gradient-to-tr from-[#D98B2B]/30 via-[#ffb86c]/15 to-[#111113]" />

      {/* Top Floating Header Bar */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#17171A] border border-[#23242A] flex items-center justify-center shadow-xl">
            <Radio className="w-4 h-4 text-[#ffb86c] animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-[#F7F5F0] tracking-wide flex items-center gap-2">
              Aven Voice
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#ffb86c]/15 text-[#ffb86c] border border-[#ffb86c]/30">
                Studio Neural Kernel
              </span>
            </div>
            <p className="text-xs text-[#85827A] font-mono">Real-Time Autonomous Voice Interaction</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Status Indicator Badge */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#17171A] border border-[#23242A] text-xs font-mono text-[#C5C2BA] shadow-lg">
            <Volume2 className="w-3.5 h-3.5 text-[#ffb86c]" />
            <span className="font-semibold text-[#F7F5F0]">
              {isMuted
                ? "Muted"
                : status === "speaking"
                ? "Speaking"
                : status === "thinking" || status === "transcribing"
                ? "Thinking"
                : hasDetectedUserSpeech
                ? "Hearing You"
                : "Listening"}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isMuted
                  ? "bg-rose-400"
                  : status === "speaking" || status === "thinking"
                  ? "bg-[#ffb86c] animate-ping"
                  : "bg-emerald-400 animate-pulse"
              }`}
            />
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => {
              endSession();
              onClose();
            }}
            className="w-10 h-10 rounded-xl bg-[#17171A] hover:bg-[#1E1F24] text-[#85827A] hover:text-[#F7F5F0] border border-[#23242A] flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer"
            title="End Call (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Center Hologram Stage */}
      <div className="flex flex-col items-center justify-center max-w-lg w-full text-center px-4 relative z-10">
        {/* Living Aven WebGL2 Orb (Same Orb as Cockpit) */}
        <div className="relative flex items-center justify-center w-72 h-72 sm:w-80 sm:h-80 my-2">
          {/* Outer Breathing Amber Glow Atmosphere */}
          <div
            className="absolute rounded-full transition-transform duration-150 blur-3xl pointer-events-none opacity-30 bg-gradient-to-tr from-[#D98B2B] via-[#ffb86c] to-transparent"
            style={{
              width: "280px",
              height: "280px",
              transform: `scale(${1 + audioLevel * 0.45})`,
            }}
          />

          {/* Acoustic Wave Ripple Rings */}
          <div
            className="absolute rounded-full border border-[#ffb86c]/20 transition-transform duration-100 ease-out pointer-events-none"
            style={{
              width: "230px",
              height: "230px",
              transform: `scale(${1 + audioLevel * 0.3})`,
            }}
          />
          <div
            className="absolute rounded-full border border-[#ffb86c]/10 transition-transform duration-150 ease-out pointer-events-none"
            style={{
              width: "260px",
              height: "260px",
              transform: `scale(${1 + audioLevel * 0.45})`,
            }}
          />

          {/* Interactive WebGL2 AI Blob */}
          <div
            onClick={() => {
              if (status === "speaking") {
                interruptAssistant();
              } else if (status === "listening" && hasDetectedUserSpeech) {
                finishSpeakingAndSend();
              }
            }}
            className="w-full h-full cursor-pointer z-10 select-none"
            title={
              status === "speaking"
                ? "Tap orb to interrupt"
                : hasDetectedUserSpeech
                ? "Tap orb to send now"
                : "Aven living neural core"
            }
          >
            <AvenBlob
              colors={["#D98B2B", "#F5E6C8", "#8C5212"]}
              backgroundColor="#111113"
              size={1.05 * orbScale}
              glow={dynamicGlow}
              bleed={1.0}
              wobble={dynamicWobble}
              highlight={1.3}
              trail={1.1}
              speed={dynamicSpeed}
              state={blobState}
              hoverIntensity={1.3}
              followCursor={true}
              clickPulse={true}
              intro={true}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Live Audio Level Equalizer Bars */}
        <div className="flex items-center gap-1.5 h-6 mb-3">
          {Array.from({ length: 16 }).map((_, idx) => {
            const distanceFromCenter = Math.abs(idx - 7.5);
            const dampening = Math.max(0.2, 1 - distanceFromCenter / 8);
            const barHeight = Math.max(
              3,
              audioLevel * 24 * dampening + (status === "speaking" ? 6 * Math.sin(idx + Date.now() / 200) : 2)
            );

            return (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-75 ${
                  status === "speaking"
                    ? "bg-[#ffb86c] shadow-[0_0_8px_rgba(255,184,108,0.8)]"
                    : hasDetectedUserSpeech
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                    : "bg-[#23242A]"
                }`}
                style={{ height: `${barHeight}px` }}
              />
            );
          })}
        </div>

        {/* Interactive Action Hint */}
        <div className="flex flex-col items-center gap-2 mb-3">
          {status === "speaking" ? (
            <button
              type="button"
              onClick={interruptAssistant}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#ffb86c]/15 hover:bg-[#ffb86c]/25 text-[#ffb86c] border border-[#ffb86c]/30 text-xs font-mono transition-all active:scale-95 cursor-pointer shadow-md"
            >
              <Mic size={12} className="text-[#ffb86c]" />
              <span>Tap orb to interrupt</span>
            </button>
          ) : status === "listening" && hasDetectedUserSpeech ? (
            <button
              type="button"
              onClick={finishSpeakingAndSend}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold font-mono bg-[#ffb86c] hover:bg-[#ffb86c]/90 text-[#1A0F00] transition-all active:scale-95 shadow-lg shadow-[#ffb86c]/20 cursor-pointer"
            >
              <Send size={12} />
              <span>Tap orb to Send Now</span>
            </button>
          ) : null}
        </div>

        {/* Live Streaming Dialogue Display Card */}
        <div className="w-full min-h-[90px] max-h-[140px] overflow-y-auto px-5 py-3.5 rounded-2xl bg-[#17171A] border border-[#23242A] backdrop-blur-2xl text-left shadow-2xl custom-h-scrollbar">
          {errorMessage ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-mono">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => startSession()}
                className="self-start flex items-center gap-1 text-[11px] font-mono px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition cursor-pointer"
              >
                <RotateCcw size={12} /> Retry Connection
              </button>
            </div>
          ) : status === "listening" && userTranscript ? (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Transcript
              </div>
              <p className="text-xs text-[#F7F5F0] leading-relaxed font-medium">
                "{userTranscript}"
              </p>
            </div>
          ) : assistantTranscript ? (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#ffb86c] block mb-1 font-mono">
                Aven
              </span>
              <p className="text-xs text-[#F7F5F0] leading-relaxed font-normal">
                {assistantTranscript}
              </p>
            </div>
          ) : userTranscript ? (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#85827A] block mb-1 font-mono">
                You
              </span>
              <p className="text-xs text-[#C5C2BA] leading-relaxed italic">
                "{userTranscript}"
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2 text-center text-[#85827A]">
              <div className="flex items-center gap-1.5 text-xs text-[#C5C2BA] font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ffb86c]" />
                <span>Ready. Speak naturally or tap the orb when done.</span>
              </div>
              <p className="text-[10px] text-[#85827A] mt-1 font-mono">
                LifeOS Neural Voice Architecture (Full-Duplex)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Control Dock */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 pointer-events-auto z-20">
        {/* Mute Button */}
        <button
          type="button"
          onClick={toggleMute}
          className={`p-3.5 rounded-2xl border transition-all shadow-xl backdrop-blur-xl active:scale-95 cursor-pointer ${
            isMuted
              ? "bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30"
              : "bg-[#17171A] text-[#C5C2BA] border-[#23242A] hover:bg-[#1E1F24] hover:text-[#F7F5F0]"
          }`}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOff className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Send / Interrupt Button */}
        <button
          type="button"
          onClick={() => {
            if (status === "speaking") {
              interruptAssistant();
            } else {
              finishSpeakingAndSend();
            }
          }}
          className="p-3.5 rounded-2xl bg-[#17171A] hover:bg-[#1E1F24] text-[#ffb86c] border border-[#23242A] shadow-xl backdrop-blur-xl active:scale-95 cursor-pointer"
          title={status === "speaking" ? "Interrupt Aven" : "Send Current Speech"}
        >
          <Sparkles className="w-5 h-5" />
        </button>

        {/* End Call Button */}
        <button
          type="button"
          onClick={() => {
            endSession();
            onClose();
          }}
          className="p-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-950/40 border border-rose-500/40 active:scale-95 transition-all flex items-center gap-2 font-mono text-xs font-semibold cursor-pointer"
          title="End Voice Call"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
}
