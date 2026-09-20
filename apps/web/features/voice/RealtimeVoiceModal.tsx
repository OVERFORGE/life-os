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
import {
  useRealtimeVoice,
} from "./useRealtimeVoice";

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

  if (!isOpen) return null;

  const orbScale = 1 + audioLevel * 0.35;
  const outerAuraScale = 1 + audioLevel * 0.65;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0C]/95 backdrop-blur-3xl transition-all duration-500 select-none overflow-hidden">
      {/* LifeOS Ambient Crimson Glow Background Mesh */}
      <div
        className={`absolute -inset-[30%] pointer-events-none transition-all duration-1000 opacity-20 blur-[130px] ${
          status === "speaking"
            ? "bg-gradient-to-tr from-[#E8414A] via-[#B42129] to-black"
            : status === "thinking"
            ? "bg-gradient-to-tr from-[#991B1B] via-[#7F1D1D] to-black"
            : status === "transcribing"
            ? "bg-gradient-to-tr from-[#D62C35] via-[#B42129] to-black"
            : hasDetectedUserSpeech
            ? "bg-gradient-to-tr from-[#F3767D] via-[#E8414A] to-black"
            : "bg-gradient-to-tr from-[#B42129]/40 via-[#161618] to-black"
        }`}
      />

      {/* Top Floating Header Bar */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#161618] border border-[#E8414A]/30 flex items-center justify-center shadow-xl shadow-black/80 backdrop-blur-xl">
            <Radio className="w-5 h-5 text-[#E8414A] animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              LifeOS Voice
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#E8414A]/15 text-[#F9A8AC] border border-[#E8414A]/30">
                Chief of Staff
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-normal">Real-Time Autonomous Voice Kernel</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Permanent LifeOS Voice Indicator Badge (Fixed) */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161618] border border-[#E8414A]/30 text-xs font-mono text-[#F9A8AC] shadow-lg shadow-black/60">
            <Volume2 className="w-3.5 h-3.5 text-[#E8414A]" />
            <span className="font-semibold tracking-wide">LifeOS Voice</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A] animate-pulse" />
          </div>

          {/* Close Button */}
          <button
            onClick={() => {
              endSession();
              onClose();
            }}
            className="p-2.5 rounded-xl bg-[#161618] hover:bg-[#2A2B2F] text-zinc-400 hover:text-white border border-white/10 shadow-lg shadow-black/60 backdrop-blur-xl transition-all active:scale-95"
            title="Close call"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Center Hologram Stage */}
      <div className="flex flex-col items-center justify-center max-w-lg w-full text-center px-4 relative z-10">
        {/* Living LifeOS 3D Fluid Energy Orb */}
        <div className="relative flex items-center justify-center w-80 h-80 my-4">
          {/* Outer Breathing Energy Atmosphere */}
          <div
            className={`absolute rounded-full transition-all duration-150 blur-3xl pointer-events-none opacity-40 ${
              status === "speaking"
                ? "bg-gradient-to-tr from-[#E8414A] to-[#B42129]"
                : status === "thinking"
                ? "bg-gradient-to-tr from-[#991B1B] to-[#7F1D1D]"
                : status === "transcribing"
                ? "bg-gradient-to-tr from-[#D62C35] to-[#B42129]"
                : hasDetectedUserSpeech
                ? "bg-gradient-to-tr from-[#F3767D] to-[#E8414A]"
                : "bg-gradient-to-tr from-[#B42129]/30 to-transparent"
            }`}
            style={{
              width: "280px",
              height: "280px",
              transform: `scale(${outerAuraScale})`,
            }}
          />

          {/* Acoustic Wave Ripple Rings */}
          <div
            className="absolute rounded-full border border-[#E8414A]/20 transition-transform duration-100 ease-out pointer-events-none"
            style={{
              width: "230px",
              height: "230px",
              transform: `scale(${orbScale * 1.05})`,
            }}
          />
          <div
            className="absolute rounded-full border border-[#E8414A]/10 transition-transform duration-150 ease-out pointer-events-none"
            style={{
              width: "260px",
              height: "260px",
              transform: `scale(${orbScale * 1.15})`,
            }}
          />

          {/* Interactive Core Living Orb */}
          <div
            onClick={() => {
              if (status === "speaking") {
                interruptAssistant();
              } else if (status === "error") {
                startSession();
              } else {
                finishSpeakingAndSend();
              }
            }}
            title={
              status === "speaking"
                ? "Click orb to interrupt"
                : status === "error"
                ? "Click orb to retry"
                : "Click orb to send speech now"
            }
            className={`relative flex items-center justify-center w-44 h-44 rounded-full shadow-2xl transition-all duration-300 cursor-pointer select-none overflow-hidden active:scale-95 group ${
              status === "speaking"
                ? "bg-gradient-to-tr from-[#E8414A] via-[#D62C35] to-[#991B1B] shadow-[#E8414A]/50 ring-4 ring-[#E8414A]/40"
                : status === "thinking"
                ? "bg-gradient-to-tr from-[#991B1B] via-[#7F1D1D] to-[#1F2023] shadow-[#991B1B]/40 ring-4 ring-[#E8414A]/30 animate-pulse"
                : status === "transcribing"
                ? "bg-gradient-to-tr from-[#D62C35] via-[#B42129] to-[#7F1D1D] shadow-[#D62C35]/50 ring-4 ring-[#E8414A]/40 animate-pulse"
                : status === "error"
                ? "bg-gradient-to-tr from-rose-900 via-red-950 to-black shadow-rose-900/50 ring-4 ring-rose-500/40"
                : hasDetectedUserSpeech
                ? "bg-gradient-to-tr from-[#F3767D] via-[#E8414A] to-[#B42129] shadow-[#E8414A]/60 ring-4 ring-[#F9A8AC]/40 animate-pulse"
                : "bg-gradient-to-tr from-[#161618] via-[#1F2023] to-[#0A0A0C] shadow-black/80 ring-2 ring-[#E8414A]/30 hover:ring-[#E8414A]/60"
            }`}
            style={{
              transform: `scale(${status === "speaking" ? 1 + audioLevel * 0.2 : orbScale})`,
            }}
          >
            {/* Glass Sheen Highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/40 rounded-full pointer-events-none" />

            {/* Central Living Icon */}
            <div className="relative z-10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              {status === "speaking" ? (
                <Volume2 className="w-14 h-14 text-white drop-shadow-md animate-pulse" />
              ) : status === "thinking" ? (
                <Sparkles className="w-14 h-14 text-[#F9A8AC] drop-shadow-md animate-spin" />
              ) : isMuted ? (
                <MicOff className="w-14 h-14 text-zinc-400 drop-shadow-md" />
              ) : hasDetectedUserSpeech ? (
                <Send className="w-14 h-14 text-white drop-shadow-md" />
              ) : (
                <Mic className="w-14 h-14 text-white drop-shadow-md" />
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Acoustic Soundwave Bars */}
        <div className="flex items-center justify-center gap-1.5 h-8 my-2">
          {[0.25, 0.5, 0.8, 1.0, 0.7, 0.9, 0.6, 0.4, 0.2].map((multiplier, idx) => {
            const barHeight = Math.max(
              4,
              Math.min(28, audioLevel * multiplier * 36 + (hasDetectedUserSpeech ? 8 : 4))
            );
            return (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-75 ${
                  status === "speaking"
                    ? "bg-[#E8414A] shadow-sm shadow-[#E8414A]/60"
                    : hasDetectedUserSpeech
                    ? "bg-[#F3767D] shadow-sm shadow-[#F3767D]/60"
                    : "bg-[#E8414A]/25"
                }`}
                style={{ height: `${barHeight}px` }}
              />
            );
          })}
        </div>

        {/* Live Status Pill */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <div
            className={`px-4 py-1.5 rounded-full border text-xs font-semibold tracking-wide flex items-center gap-2 shadow-lg backdrop-blur-xl transition-all ${
              status === "speaking"
                ? "text-[#F9A8AC] border-[#E8414A]/50 bg-[#E8414A]/15 shadow-[#E8414A]/20"
                : status === "thinking"
                ? "text-[#F3767D] border-[#B42129]/50 bg-[#B42129]/20 shadow-[#B42129]/20"
                : status === "transcribing"
                ? "text-amber-200 border-amber-500/40 bg-amber-500/15"
                : status === "error"
                ? "text-rose-300 border-rose-500/50 bg-rose-500/20 shadow-rose-500/20"
                : hasDetectedUserSpeech
                ? "text-[#F9A8AC] border-[#E8414A]/60 bg-[#E8414A]/25 shadow-[#E8414A]/30"
                : "text-zinc-300 border-white/15 bg-[#161618]/90"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-ping" />
            {isMuted
              ? "Microphone Muted"
              : status === "speaking"
              ? "Chief of Staff Speaking... (Speak to interrupt)"
              : status === "thinking"
              ? "Synthesizing Response..."
              : status === "transcribing"
              ? "Transcribing Speech..."
              : status === "error"
              ? "Connection Interrupted"
              : hasDetectedUserSpeech
              ? "Hearing Your Voice... (Pause to send)"
              : "Listening... (Speak naturally)"}
          </div>

          {/* Action Hint Button */}
          {status === "speaking" ? (
            <button
              onClick={interruptAssistant}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#E8414A]/15 hover:bg-[#E8414A]/25 text-[#F9A8AC] border border-[#E8414A]/30 text-[11px] font-medium transition-all active:scale-95"
            >
              <Mic size={12} />
              Speak or tap to interrupt
            </button>
          ) : status === "listening" && hasDetectedUserSpeech ? (
            <button
              onClick={finishSpeakingAndSend}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#E8414A] hover:bg-[#D62C35] text-white border border-[#F3767D]/40 transition-all active:scale-95 shadow-lg shadow-[#E8414A]/30"
            >
              <Send size={12} />
              Tap to Send Now
            </button>
          ) : null}
        </div>

        {/* Live Streaming Dialogue Display Card */}
        <div className="w-full min-h-[90px] max-h-[130px] overflow-y-auto px-5 py-3.5 rounded-2xl bg-[#161618]/95 border border-white/10 backdrop-blur-2xl text-left shadow-2xl shadow-black/80 transition-all">
          {errorMessage ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => startSession()}
                className="self-start flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all"
              >
                <RotateCcw size={12} /> Retry Audio Connection
              </button>
            </div>
          ) : status === "listening" && userTranscript ? (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#E8414A] mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8414A] animate-ping" />
                Live Transcript
              </div>
              <p className="text-xs text-zinc-100 leading-relaxed font-medium">
                "{userTranscript}"
              </p>
            </div>
          ) : assistantTranscript ? (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E8414A] block mb-1">
                Chief of Staff
              </span>
              <p className="text-xs text-zinc-100 leading-relaxed font-normal">
                {assistantTranscript}
              </p>
            </div>
          ) : userTranscript ? (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                You
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed italic">
                "{userTranscript}"
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2 text-center text-zinc-400">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-[#E8414A]" />
                <span>Ready. Speak naturally or tap the orb when done.</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-mono">
                LifeOS Neural Full-Duplex Architecture
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Floating Dock */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-5 pointer-events-auto z-20">
        {/* Mute Button */}
        <button
          onClick={toggleMute}
          className={`p-4 rounded-2xl border transition-all shadow-xl shadow-black/60 backdrop-blur-xl active:scale-95 ${
            isMuted
              ? "bg-[#E8414A]/20 text-[#F3767D] border-[#E8414A]/40 hover:bg-[#E8414A]/30"
              : "bg-[#161618] text-zinc-300 border-white/10 hover:bg-[#1F2023] hover:text-white"
          }`}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* End Call Button */}
        <button
          onClick={() => {
            endSession();
            onClose();
          }}
          className="p-4.5 px-6 rounded-2xl bg-[#E8414A] hover:bg-[#D62C35] text-white shadow-xl shadow-[#E8414A]/30 border border-[#F3767D]/30 active:scale-95 transition-all flex items-center gap-2 font-medium text-sm"
          title="End Voice Call"
        >
          <PhoneOff className="w-5 h-5" />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
}
