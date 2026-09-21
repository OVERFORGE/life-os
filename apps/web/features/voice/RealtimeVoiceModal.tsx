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

  const orbScale = 1 + audioLevel * 0.25;
  const outerAuraScale = 1 + audioLevel * 0.45;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#161618]/98 backdrop-blur-3xl transition-all duration-500 select-none overflow-hidden">
      {/* LifeOS Ambient Crimson Glow Background Mesh */}
      <div
        className="absolute -inset-[30%] pointer-events-none transition-all duration-1000 opacity-20 blur-[130px] bg-gradient-to-tr from-[#E8414A]/25 via-[#B42129]/15 to-[#161618]"
      />

      {/* Top Floating Header Bar */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-auto z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#161618] border border-[#E8414A]/30 flex items-center justify-center shadow-xl shadow-black/80 backdrop-blur-xl">
            <Radio className="w-5 h-5 text-[#E8414A] animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#FFFDFC] tracking-wide flex items-center gap-2">
              LifeOS Voice
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#E8414A]/15 text-[#E8414A] border border-[#E8414A]/30">
                Aven
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-normal">Real-Time Autonomous Voice Kernel</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Permanent LifeOS Voice Indicator Badge */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161618] border border-[#E8414A]/30 text-xs font-mono text-zinc-300 shadow-lg shadow-black/60">
            <Volume2 className="w-3.5 h-3.5 text-[#E8414A]" />
            <span className="font-semibold tracking-wide text-zinc-200">LifeOS Voice</span>
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
        {/* Living LifeOS Single Consistent Energy Orb */}
        <div className="relative flex items-center justify-center w-80 h-80 my-4">
          {/* Outer Breathing Crimson Energy Atmosphere */}
          <div
            className="absolute rounded-full transition-transform duration-200 blur-3xl pointer-events-none opacity-30 bg-gradient-to-tr from-[#E8414A] via-[#B42129] to-transparent"
            style={{
              width: "280px",
              height: "280px",
              transform: `scale(${outerAuraScale})`,
            }}
          />

          {/* Acoustic Wave Ripple Rings */}
          <div
            className="absolute rounded-full border border-[#E8414A]/25 transition-transform duration-100 ease-out pointer-events-none"
            style={{
              width: "230px",
              height: "230px",
              transform: `scale(${orbScale * 1.05})`,
            }}
          />
          <div
            className="absolute rounded-full border border-[#E8414A]/15 transition-transform duration-150 ease-out pointer-events-none"
            style={{
              width: "260px",
              height: "260px",
              transform: `scale(${orbScale * 1.15})`,
            }}
          />

          {/* Interactive Core Living Orb (Normal Dark Orb with Red Accent) */}
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
            className="relative flex items-center justify-center w-44 h-44 rounded-full shadow-2xl transition-all duration-300 cursor-pointer select-none overflow-hidden active:scale-95 group bg-gradient-to-b from-[#1F2023] via-[#161618] to-[#161618] shadow-black/90 ring-2 ring-[#E8414A]/40 hover:ring-[#E8414A]/70"
            style={{
              transform: `scale(${orbScale})`,
            }}
          >
            {/* Subtle Glass Sheen Highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-[#161618]/70 rounded-full pointer-events-none" />

            {/* Subtle Red Inner Glow Ring */}
            <div className="absolute inset-1 rounded-full border border-[#E8414A]/20 pointer-events-none" />

            {/* Central Living Icon */}
            <div className="relative z-10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              {status === "speaking" ? (
                <Volume2 className="w-14 h-14 text-[#E8414A] drop-shadow-md animate-pulse" />
              ) : status === "thinking" || status === "transcribing" ? (
                <Sparkles className="w-14 h-14 text-[#E8414A] drop-shadow-md animate-spin" />
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
                    ? "bg-[#E8414A]/80 shadow-sm shadow-[#E8414A]/40"
                    : "bg-[#E8414A]/25"
                }`}
                style={{ height: `${barHeight}px` }}
              />
            );
          })}
        </div>

        {/* Live Status Pill (Secret Background Transcription - Never shows 'Transcribing') */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <div
            className={`px-4 py-1.5 rounded-full border text-xs font-semibold tracking-wide flex items-center gap-2 shadow-lg backdrop-blur-xl transition-all ${
              status === "speaking"
                ? "text-zinc-100 border-[#E8414A]/50 bg-[#E8414A]/15 shadow-[#E8414A]/20"
                : status === "thinking" || status === "transcribing"
                ? "text-zinc-200 border-[#E8414A]/40 bg-[#E8414A]/10 shadow-[#E8414A]/20"
                : status === "error"
                ? "text-zinc-200 border-[#E8414A]/50 bg-[#E8414A]/20 shadow-[#E8414A]/20"
                : hasDetectedUserSpeech
                ? "text-zinc-100 border-[#E8414A]/60 bg-[#E8414A]/20 shadow-[#E8414A]/30"
                : "text-zinc-300 border-[#2A2B2F] bg-[#161618]/90"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#E8414A] animate-ping" />
            {isMuted
              ? "Microphone Muted"
              : status === "speaking"
              ? "Aven Speaking"
              : status === "thinking" || status === "transcribing"
              ? "Thinking..."
              : status === "error"
              ? "Connection Interrupted"
              : hasDetectedUserSpeech
              ? "Hearing You... (Pause to send)"
              : "Listening..."}
          </div>

          {/* Action Hint Button */}
          {status === "speaking" ? (
            <button
              onClick={interruptAssistant}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#E8414A]/15 hover:bg-[#E8414A]/25 text-zinc-200 border border-[#E8414A]/30 text-[11px] font-medium transition-all active:scale-95"
            >
              <Mic size={12} className="text-[#E8414A]" />
              Tap to interrupt
            </button>
          ) : status === "listening" && hasDetectedUserSpeech ? (
            <button
              onClick={finishSpeakingAndSend}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-[#E8414A] hover:bg-[#D62C35] text-white border border-[#E8414A]/40 transition-all active:scale-95 shadow-lg shadow-[#E8414A]/30"
            >
              <Send size={12} />
              Tap to Send Now
            </button>
          ) : null}
        </div>

        {/* Live Streaming Dialogue Display Card */}
        <div className="w-full min-h-[90px] max-h-[130px] overflow-y-auto px-5 py-3.5 rounded-2xl bg-[#161618]/95 border border-[#2A2B2F] backdrop-blur-2xl text-left shadow-2xl shadow-black/80 transition-all">
          {errorMessage ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-zinc-200 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#E8414A]" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => startSession()}
                className="self-start flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-[#E8414A]/20 hover:bg-[#E8414A]/30 text-zinc-200 border border-[#E8414A]/40 transition-all"
              >
                <RotateCcw size={12} className="text-[#E8414A]" /> Retry Connection
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
                Aven
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
                LifeOS Neural Voice Architecture
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
              ? "bg-[#E8414A]/20 text-[#E8414A] border-[#E8414A]/40 hover:bg-[#E8414A]/30"
              : "bg-[#161618] text-zinc-300 border-[#2A2B2F] hover:bg-[#1F2023] hover:text-white"
          }`}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOff className="w-6 h-6 text-[#E8414A]" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* End Call Button */}
        <button
          onClick={() => {
            endSession();
            onClose();
          }}
          className="p-4.5 px-6 rounded-2xl bg-[#E8414A] hover:bg-[#D62C35] text-white shadow-xl shadow-[#E8414A]/30 border border-[#E8414A]/40 active:scale-95 transition-all flex items-center gap-2 font-medium text-sm"
          title="End Voice Call"
        >
          <PhoneOff className="w-5 h-5" />
          <span>End Call</span>
        </button>
      </div>
    </div>
  );
}
